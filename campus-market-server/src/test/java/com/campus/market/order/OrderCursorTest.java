package com.campus.market.order;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class OrderCursorTest {
    @Test
    void roundTripUsesCreatedAtAndId() {
        var cursor = new OrderCursor(LocalDateTime.of(2026, 11, 18, 10, 30, 15, 123456000), 42);
        assertEquals(cursor, OrderCursor.decode(cursor.encode()));
    }

    @Test
    void blankMeansFirstPage() {
        assertNull(OrderCursor.decode(null));
        assertNull(OrderCursor.decode(""));
        assertNull(OrderCursor.decode("  "));
    }

    @Test
    void malformedTokensAreRejected() {
        for (String token : new String[] {"%%%", "abc", "A".repeat(161)}) {
            assertThrows(OrderException.class, () -> OrderCursor.decode(token));
        }
        for (String value :
                new String[] {"not-a-time|1", "2026-11-18T10:00:00|0", "2026-11-18T10:00:00|x"}) {
            String token =
                    Base64.getUrlEncoder()
                            .withoutPadding()
                            .encodeToString(value.getBytes(StandardCharsets.UTF_8));
            assertThrows(OrderException.class, () -> OrderCursor.decode(token));
        }
    }
}
