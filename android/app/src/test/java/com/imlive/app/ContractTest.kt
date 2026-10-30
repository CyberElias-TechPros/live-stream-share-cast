package com.imlive.app

import com.imlive.app.media.LanSignallingContract
import org.junit.Assert.assertEquals
import org.junit.Test

class ContractTest {
    @Test
    fun signallingErrorKeepsStableMachineCode() {
        // Keep this JVM test independent of Android's unmocked org.json stubs.
        assertEquals("error", LanSignallingContract.ERROR_TYPE)
        assertEquals("p2p_capacity", LanSignallingContract.P2P_CAPACITY)
        assertEquals(8, LanSignallingContract.MAX_VIEWERS)
    }
}
