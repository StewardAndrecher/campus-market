package com.campus.market.seller;

import com.campus.market.product.ProductPageResponse;
import com.campus.market.product.SellerResponse;

public record SellerStoreResponse(SellerResponse seller, ProductPageResponse products) {}
