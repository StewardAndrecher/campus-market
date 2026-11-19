package com.campus.market.order;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Canonical order states stored in the database and exposed by the existing API. */
enum OrderStatus {
    PENDING_PAYMENT,
    PAID,
    DELIVERED,
    COMPLETED,
    CANCELLED,
    CLOSED_TIMEOUT;

    private static final Set<String> FILTERS =
            Arrays.stream(values()).map(Enum::name).collect(Collectors.toUnmodifiableSet());

    boolean is(String value) {
        return name().equals(value);
    }

    static boolean isValidFilter(String value) {
        return value != null && ("ALL".equals(value) || FILTERS.contains(value));
    }
}
