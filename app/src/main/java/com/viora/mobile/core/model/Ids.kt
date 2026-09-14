package com.viora.mobile.core.model

import java.util.UUID

object Ids {
    private val pattern = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    fun valid(value: String): Boolean = pattern.matches(value)
    fun newId(): String = UUID.randomUUID().toString()
}

object VersionToken {
    fun valid(value: String): Boolean = value.length in 3..128 &&
        value.first() == '"' && value.last() == '"' &&
        value.substring(1, value.lastIndex).all { it.code in 0x21..0x7e && it != '"' }
}
