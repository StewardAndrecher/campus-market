# 订单游标分页

原 `GET /api/orders` 保留页码、总数和汇总行为；新增 `GET /api/orders/cursor` 用于连续浏览，避免深 `OFFSET`。两种接口使用相同的登录身份、买卖双方数据范围和状态筛选。

## 请求与响应

```text
GET /api/orders/cursor?role=BUYER&status=ALL&size=10
GET /api/orders/cursor?role=BUYER&status=ALL&size=10&cursor=<nextCursor>
```

- `role` 仍为 `BUYER` / `SELLER`，`status` 仍为 `ALL` 或六种订单状态，`size` 为 1～20。
- 可选 `orderId` 精确筛选与原接口一致。
- 响应包含 `items`、`hasMore`、`nextCursor`、`size`、`role`、`status`、`orderId` 和当前角色的 `summary`；不包含 `total` / `totalPages`。
- 末页及空结果的 `hasMore=false`、`nextCursor=null`，响应仍为 `Cache-Control: no-store`。

## 查询与索引

游标载荷是 `createdAt|id` 的 Base64URL 编码，不含账号或授权信息。服务端严格限制长度、字符、时间和安全整数 ID；无效游标返回业务 400。Base64 不是加密或签名，不能替代订单参与者校验。

```sql
WHERE buyer_id=?
  AND (created_at,id) < (?,?)
ORDER BY created_at DESC,id DESC
LIMIT ?
```

卖家查询使用 `seller_id`，状态筛选沿用原参数。每次读取 `size+1` 条，只返回前 `size` 条，并用最后一条可见记录生成下一游标。相同创建时间由 ID 倒序打破并列，避免重复或漏项。

V69 已有 `(buyer_id,created_at DESC,id DESC)` 与 `(seller_id,created_at DESC,id DESC)` 索引，可直接服务 ALL 游标查询，无需重复新增；指定状态时使用 V136 的 `(participant,status,created_at,id)` 索引。实际查询仍应通过执行计划确认索引选择，历史迁移不改写。

游标不是跨请求数据库快照：新订单、状态变化或筛选命中变化可能影响后续结果；续页时不需要锚点订单仍存在。`summary` 只表示本次请求读取到的角色汇总，不承诺与前一页处于同一数据库快照。

## 与关键词搜索的边界

订单编号是精确筛选，不使用 LIKE。商品标题的包含关键词查询仍可能扫描候选行；本次没有宣称解决全文检索。若真实数据证明需要，应先记录执行计划和中文分词效果，再评估 MySQL ngram 全文索引，不为展示技术名词而直接引入 Elasticsearch。

## 验证

`OrderCursorTest` 覆盖游标往返和非法输入；`OrderQueryIntegrationTest` 增加相同时间戳下多页遍历、无重复/漏项、参与者隔离、非法状态/游标/页大小测试。最终数量以 `docs/VERIFICATION.md` 的本轮干净回归记录为准。
