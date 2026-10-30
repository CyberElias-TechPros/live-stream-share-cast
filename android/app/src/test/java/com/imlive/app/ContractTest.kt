package com.imlive.app

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class ContractTest {
    @Test
    fun signallingErrorKeepsStableMachineCode() {
        val frame = JSONObject()
            .put("type", "error")
            .put("code", "p2p_capacity")
            .put("maxViewers", 8)
        assertEquals("p2p_capacity", frame.getString("code"))
        assertEquals(8, frame.getInt("maxViewers"))
    }
}
