package com.campus.market.order;

/** Allowed transitions shared by order state changes and their append-only event records. */
enum OrderTransition {
    CREATED("CREATED", null, OrderStatus.PENDING_PAYMENT, "created_at"),
    CANCELLED("CANCELLED", OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, "cancelled_at"),
    SIMULATED_PAYMENT(
            "SIMULATED_PAYMENT", OrderStatus.PENDING_PAYMENT, OrderStatus.PAID, "paid_at"),
    DELIVERED("DELIVERED", OrderStatus.PAID, OrderStatus.DELIVERED, "delivered_at"),
    COMPLETED("COMPLETED", OrderStatus.DELIVERED, OrderStatus.COMPLETED, "completed_at"),
    TIMEOUT_CLOSED(
            "TIMEOUT_CLOSED", OrderStatus.PENDING_PAYMENT, OrderStatus.CLOSED_TIMEOUT, "closed_at");

    final String action;
    final OrderStatus from;
    final OrderStatus to;
    final String timeColumn;

    OrderTransition(String action, OrderStatus from, OrderStatus to, String timeColumn) {
        this.action = action;
        this.from = from;
        this.to = to;
        this.timeColumn = timeColumn;
    }

    String fromName() {
        return from == null ? null : from.name();
    }
}
