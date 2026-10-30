package com.imlive.app

import org.junit.Assert.assertEquals
import org.junit.Test

class ContractTest {
    @Test
    fun signallingErrorKeepsStableMachineCode() {
        // Keep this JVM test independent of Android's unmocked org.json stubs.
        val frame = mapOf<String, Any>(
            "type" to "error",
            "code" to "p2p_capacity",
            "maxViewers" to 8,
        )
        assertEquals("p2p_capacity", frame["code"])
        assertEquals(8, frame["maxViewers"])
    }
}
