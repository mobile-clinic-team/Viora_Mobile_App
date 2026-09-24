package com.viora.mobile

import android.os.Bundle
import android.view.View
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.lifecycle.ViewModelProvider
import com.viora.mobile.app.AppShell
import com.viora.mobile.app.AppViewModel
import com.viora.mobile.core.ui.VioraTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val graph get() = (application as VioraApplication).graph
    private var covered by mutableStateOf(true)

    override fun onCreate(savedInstanceState: Bundle?) {
        // Navigation and PHI are never restored from Activity saved state.
        super.onCreate(null)
        enableEdgeToEdge()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.decorView.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        if (android.os.Build.VERSION.SDK_INT >= 30) window.decorView.importantForContentCapture = View.IMPORTANT_FOR_CONTENT_CAPTURE_NO_EXCLUDE_DESCENDANTS
        val model = ViewModelProvider(this, AppViewModel.Factory(graph))[AppViewModel::class.java]
        setContent { VioraTheme {
            if (covered) com.viora.mobile.core.ui.VioraSplash()
            else AppShell(model)
        } }
    }
    override fun onPause() {
        covered = true
        super.onPause()
    }
    override fun onStop() {
        if (!isChangingConfigurations) graph.privacy.background()
        super.onStop()
    }
    override fun onResume() {
        super.onResume()
        graph.scope.launch {
            graph.privacy.foreground()
            covered = false
        }
    }
}

