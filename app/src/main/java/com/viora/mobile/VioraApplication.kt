package com.viora.mobile

import android.app.Application
import com.viora.mobile.app.AppGraph

class VioraApplication : Application() {
    val graph: AppGraph by lazy { AppGraph(this) }
}
