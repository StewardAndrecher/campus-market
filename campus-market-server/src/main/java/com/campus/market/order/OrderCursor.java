package com.campus.market.order;

import com.campus.market.order.OrderModels.Order;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;

/** Opaque, unsigned pagination token. It contains no authorization information. */
record OrderCursor(LocalDateTime createdAt, long id) {
    private static final int MAX_ENCODED_LENGTH = 160;

    static OrderCursor decode(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            if (value.length() > MAX_ENCODED_LENGTH || !value.matches("[A-Za-z0-9_-]+")) {
                throw new IllegalArgumentException();
            }
            String decoded =
                    new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            String[] parts = decoded.split("\\|", -1);
            if (parts.length != 2) throw new IllegalArgumentException();
            LocalDateTime createdAt = LocalDateTime.parse(parts[0]);
            if (!parts[1].matches("[1-9][0-9]{0,15}")) throw new IllegalArgumentException();
            long id = Long.parseLong(parts[1]);
            if (id > 9007199254740991L) throw new IllegalArgumentException();
            return new OrderCursor(createdAt, id);
        } catch (RuntimeException invalid) {
            throw OrderException.invalid("订单游标无效，请重新加载第一页");
        }
    }

    static OrderCursor from(Order order) {
        return new OrderCursor(LocalDateTime.parse(order.createdAt()), order.id());
    }

    String encode() {
        String value = createdAt + "|" + id;
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
