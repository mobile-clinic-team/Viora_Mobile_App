package com.viora.mobile.feature.assistant.ui

import android.text.InputType
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import com.viora.mobile.app.navigation.NavigationDependencies
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.core.ui.*
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.domain.*
import kotlinx.coroutines.delay

class AssistantScreens(private val repository: AssistantRepository,private val contexts: AssistantContextReader,
    private val assurance: AssistantAssurancePort,private val handoff: ClinicalHandoffPort,private val clock: AppClock,
    private val navigate: (Any)->Unit,private val back: ()->Unit,private val dirty: (Boolean)->Unit,
    private val clinicalNavigation: ClinicalRecordNavigation,private val synthetic: Boolean) {
    @Composable private fun model(deps: NavigationDependencies): AssistantViewModel = viewModel(factory=object: ViewModelProvider.Factory {
        override fun <T:ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST") return AssistantViewModel(repository,contexts,assurance,handoff,deps.session,deps.operations,clock) as T
        }
    })
    @Composable fun Home(deps: NavigationDependencies) {
        val model=model(deps); val state by model.state.collectAsStateWithLifecycle()
        LaunchedEffect(model) { if(state.phase=="LOADING" && !state.busy) { if(synthetic) model.home() else model.discoverOutstanding() } }
        Page("Care assistant",state,model) {
            if(state.phase=="EMPTY") UiStatePanel(UiStateKind.EMPTY, "No conversations yet", "Start a conversation when you have an authorized care context.", "assistant")
            if(state.phase in setOf("READY","EMPTY")) {
                if(synthetic) Button(onClick={navigate(AssistantCreateRoute())}) { Text("New conversation") }
                else {
                    Text("Open an existing authorized AI draft for human review.")
                    PrivateInput("Draft identifier",state.input,model::input)
                    Button(onClick={navigate(AssistantDraftRoute(state.input.trim()))}, enabled=com.viora.mobile.core.model.Ids.valid(state.input.trim())) { Text("Open draft for review") }
                }
                state.conversations.forEachIndexed { index,c ->
                    OutlinedButton(onClick={navigate(AssistantConversationRoute(c.id))}) { Text("Conversation ${index+1} · ${c.context.kind}") }
                }
                OutlinedButton(onClick=model::discoverOutstanding) { Text("Check unresolved operations") }
            }
            state.receipt?.let { receipt -> Button(onClick={model.acknowledge { navigate(when(receipt.type) {
                "AI_DRAFT" -> AssistantDraftRoute(receipt.resourceId)
                "MESSAGE" -> AssistantConversationRoute(requireNotNull(receipt.parentId))
                else -> AssistantConversationRoute(receipt.resourceId)
            }) }}) { Text("Open verified result") } }
        }
    }
    @Composable fun Create(route: AssistantCreateRoute,deps: NavigationDependencies) {
        val model=model(deps); val state by model.state.collectAsStateWithLifecycle()
        LaunchedEffect(model) { if(state.phase=="LOADING" && !state.busy) try { model.context(AssistantContext(route.kind,route.patientId,route.encounterId)) } catch(_:IllegalArgumentException) { model.invalidRoute() } }
        Page("Confirm assistant context",state,model) {
            Text("Context is fixed for each conversation. Changing context starts a new conversation after confirmation.")
            if(state.phase in setOf("READY","EMPTY")) {
                Text("Selected context: ${state.context?.kind ?: "None"}")
                OutlinedButton(onClick={model.context(AssistantContext("GENERAL"))}) { Text("General context") }
                PrivateInput("Search patient context",state.input,model::input)
                Button(onClick=model::search,enabled=state.input.trim().length>=2 && !state.busy) { Text("Find patients") }
                state.patients.forEach { patient -> OutlinedButton(onClick={model.patient(patient)}) { Text(patient.fullName) } }
                state.encounters.forEachIndexed { index,e -> OutlinedButton(onClick={model.context(AssistantContext("ENCOUNTER",e.patientId,e.id))}) { Text("Use encounter ${index+1} · ${e.status}") } }
                state.target?.let { Text("Existing target: version ${it.currentVersion} · ${it.status}") }
                Button(onClick=model::createConversation,enabled=state.context!=null && !state.busy) { Text("Confirm and create conversation") }
            }
            state.receipt?.takeIf { it.type=="CONVERSATION" }?.let { receipt ->
                Button(onClick={model.acknowledge { navigate(AssistantConversationRoute(receipt.resourceId)) }}) { Text("Open conversation") }
            }
        }
    }
    @Composable fun Conversation(id: String,deps: NavigationDependencies) {
        val model=model(deps); val state by model.state.collectAsStateWithLifecycle()
        LaunchedEffect(model) { if(state.phase=="LOADING" && !state.busy) model.openConversation(id) }
        Page("Conversation",state,model) {
            if(state.phase in setOf("READY","SAVED","RESOLVED_FAILURE") && state.conversation!=null) {
                Text("Context: ${state.conversation!!.context.kind}")
                Text("AI output is advisory. A clinician must review it; it is not a clinical decision.")
                state.messages.forEach { message -> Text(if(message.role=="USER") "You" else "AI-generated advisory"); Text(message.text) }
                if(state.messages.isEmpty()) Text("No messages yet.")
                PrivateInput("Question",state.input,model::input)
                Button(onClick=model::send,enabled=!state.busy && state.pending==null && state.input.isNotBlank()) { Text("Send question") }
                if(state.target!=null) {
                    Text("Target record version ${state.target!!.currentVersion}")
                    Button(onClick=model::generate,enabled=state.target!!.status=="DRAFT" && state.pending==null && !state.busy) { Text("Generate synthetic draft") }
                    state.drafts.forEachIndexed { index,d -> OutlinedButton(onClick={navigate(AssistantDraftRoute(d.id))}) { Text("Existing draft ${index+1} · ${d.status}") } }
                } else Text("Choose an encounter with an existing DRAFT record in a new conversation to generate a clinical draft.")
                OutlinedButton(onClick={navigate(AssistantCreateRoute())},enabled=state.pending==null && state.input.isEmpty()) { Text("Change context · new conversation") }
            }
            state.receipt?.let { receipt ->
                if(receipt.type=="AI_DRAFT") Button(onClick={model.acknowledge { navigate(AssistantDraftRoute(receipt.resourceId)) }}) { Text("Open AI draft") }
                else Button(onClick={model.acknowledge()}) { Text("Acknowledge result") }
            }
        }
    }
    @Composable fun Draft(id: String,deps: NavigationDependencies) {
        val model=model(deps); val state by model.state.collectAsStateWithLifecycle()
        LaunchedEffect(model) { if(state.phase=="LOADING" && !state.busy) model.openDraft(id) }
        Page("AI draft review",state,model) {
            val draft=state.draft; val target=state.target
            if(draft!=null && target!=null && state.phase in setOf("READY","SAVED","HANDOFF","RESOLVED_FAILURE")) {
                Text("AI-generated draft — explicit human review required",style=MaterialTheme.typography.titleMedium)
                Text("Draft state: ${draft.status}"); Text("Draft version: ${draft.versionToken}")
                Text("Target record version: ${target.currentVersion}"); Text("Target validator: ${draft.targetVersionToken}")
                Text("Generated: ${draft.createdAt}"); Text("Expires: ${draft.expiresAt} · checked by server")
                if(synthetic) Text("Generator: deterministic synthetic simulator. No provider was contacted.")
                Text("Provenance",style=MaterialTheme.typography.titleMedium)
                draft.provenance.forEach { p -> Text(p.label); Text("${p.kind} · ${p.sourceId} · version ${p.sourceVersion}"); p.excerpt?.let { Text(it) } }
                val before=target.current.content; val after=draft.content
                listOf("Diagnosis" to (before.diagnosis to after.diagnosis),"Symptoms" to (before.symptoms to after.symptoms),
                    "Clinical notes" to (before.clinicalNotes to after.clinicalNotes),"Treatment plan" to (before.treatmentPlan to after.treatmentPlan)).forEach { (label,values) ->
                    Text(label,style=MaterialTheme.typography.titleMedium); Text("Current: ${values.first}"); Text("Proposed: ${values.second}")
                }
                if(state.pending==null && !state.busy && state.evidence==null) when(draft.status) {
                    "GENERATED" -> Button(onClick=model::review) { Text("Start human review") }
                    "IN_REVIEW" -> {
                        val edit=state.edit
                        if(edit==null) {
                            OutlinedButton(onClick={model.edit(draft.content)}) { Text("Edit reviewed content") }
                            Button(onClick=model::requestAssurance) { Text(if(synthetic) "Request demo step-up" else "Verify identity for approval") }
                            OutlinedButton(onClick=model::reject) { Text("Reject draft") }
                        } else {
                            PrivateInput("Edit diagnosis",edit.diagnosis,{model.edit(ClinicalContent(it,edit.symptoms,edit.clinicalNotes,edit.treatmentPlan))})
                            PrivateInput("Edit symptoms",edit.symptoms,{model.edit(ClinicalContent(edit.diagnosis,it,edit.clinicalNotes,edit.treatmentPlan))})
                            PrivateInput("Edit clinical notes",edit.clinicalNotes,{model.edit(ClinicalContent(edit.diagnosis,edit.symptoms,it,edit.treatmentPlan))})
                            PrivateInput("Edit treatment plan",edit.treatmentPlan,{model.edit(ClinicalContent(edit.diagnosis,edit.symptoms,edit.clinicalNotes,it))})
                            Button(onClick=model::saveEdit) { Text("Save reviewed edit") }
                        }
                    }
                }
                if(state.receipt!=null) Button(onClick={model.acknowledge()}) { Text("Acknowledge review result") }
                if(state.evidence!=null) {
                    Text(if(synthetic) "Synthetic handoff verified. No clinical record was written or finalized." else "Clinical handoff verified. The clinical record remains a draft.",Modifier.semantics { liveRegion=LiveRegionMode.Polite })
                    Text("Verified version: ${state.evidence!!.recordVersion}")
                    Text("Audit reference: ${state.evidence!!.auditEventId}")
                    Button(onClick={ if(state.pending!=null) model.acknowledge { clinicalNavigation.open(target.reference()) } else clinicalNavigation.open(target.reference()) }) { Text(if(synthetic) "Open unchanged clinical record" else "Open verified clinical record") }
                }
            }
            if(state.confirmation) AlertDialog(onDismissRequest=model::cancelConfirmation,
                title={Text("Confirm reviewed handoff")},text={Text(if(synthetic) "The draft and target were rechecked. Explicitly approve this synthetic handoff. It will not write or finalize a clinical record." else "The draft and target were rechecked. Approve this exact reviewed content for the existing clinical record? The record will remain a draft.")},
                confirmButton={TextButton(onClick=model::approve) { Text("Approve reviewed draft") }},
                dismissButton={TextButton(onClick=model::cancelConfirmation) { Text("Cancel approval") }})
        }
    }
    @Composable private fun Page(title: String,state: AssistantState,model: AssistantViewModel,content: @Composable ColumnScope.()->Unit) {
        val isDirty=state.input.isNotEmpty() || state.edit!=null || state.pending!=null
        val lifecycle=LocalLifecycleOwner.current.lifecycle
        LaunchedEffect(state.phase,state.pending?.operationId) {
            if(state.phase=="UNKNOWN") lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                repeat(15) { delay(2000); model.checkOutcome() }
            }
        }
        var discard by remember { mutableStateOf(false) }
        SideEffect { dirty(isDirty) }
        DisposableEffect(model) { onDispose { dirty(false) } }
        BackHandler(isDirty) { discard=true }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text(title,style=MaterialTheme.typography.headlineSmall)
            if(synthetic) Text("Synthetic assistant · no real patient information or provider")
            OutlinedButton(onClick={if(isDirty) discard=true else back()}) { Text("Return") }
            when(state.phase) {
                "LOADING" -> UiStatePanel(UiStateKind.LOADING, "Loading", "Loading assistant…")
                "ASSURANCE_UNAVAILABLE" -> UiStatePanel(UiStateKind.UNAVAILABLE, "Identity verification unavailable", "The identity provider for approval is not configured. Approval remains blocked.")
                "DENIED" -> UiStatePanel(UiStateKind.DENIED, "Assistant access denied", "You do not have permission to use this assistant.")
                "EXPIRED" -> UiStatePanel(UiStateKind.UNAVAILABLE, "Assistant content expired", "Draft or conversation expired. Approval is unavailable.")
                "STALE" -> UiStatePanel(UiStateKind.ERROR, "Assistant context changed", "Reload and review; generate a new draft for a changed target.")
                "NOT_FOUND" -> UiStatePanel(UiStateKind.UNAVAILABLE, "Assistant content unavailable", "Assistant content is unavailable.")
                "ERROR" -> UiStatePanel(UiStateKind.ERROR, "Assistant information could not be verified.", "Review the context and reload before continuing.")
                "RESOLVED_FAILURE" -> UiStatePanel(UiStateKind.ERROR, "Operation did not commit", "Review before starting a new explicit attempt.")
                "RECOVERY_REQUIRED" -> { Text("Resolve existing operations before submitting another intent."); Button(onClick=model::discoverOutstanding) { Text("Find unresolved operation") } }
                "UNKNOWN","VERIFICATION_UNAVAILABLE" -> UiStatePanel(UiStateKind.ERROR, "Outcome unknown", "Stopping the wait does not prove cancellation. Do not resubmit.")
                "GENERATING" -> UiStatePanel(UiStateKind.LOADING, "Waiting for result", "Waiting for synchronous result…")
                "CLEARED" -> UiStatePanel(UiStateKind.SUCCESS, "Assistant context cleared", "The assistant context has been cleared.")
            }
            if(state.phase in setOf("ERROR","STALE","EXPIRED","NOT_FOUND") && state.pending==null) Button(onClick=model::retry) { Text("Reload assistant") }
            if(state.pending!=null && state.phase !in setOf("SAVED","HANDOFF")) {
                Button(onClick=model::checkOutcome,enabled=!state.busy) { Text("Check outcome") }
                OutlinedButton(onClick=model::closeUnknown,enabled=!state.busy) { Text("Close only if not admitted") }
            }
            if(state.busy && state.pending!=null) OutlinedButton(onClick=model::stopWaiting) { Text("Stop waiting") }
            content()
        }
        if(discard) AlertDialog(onDismissRequest={discard=false},title={Text("Discard assistant input?")},
            text={Text("Unsaved input will be lost. An unresolved operation is not cancelled; its metadata remains available for verification.")},
            confirmButton={TextButton(onClick={discard=false; dirty(false); back()}) { Text("Discard") }},
            dismissButton={TextButton(onClick={discard=false}) { Text("Stay") }})
    }
}

/** No saved view state, autofill, personalized learning, selection menu or clipboard action. */
@Composable private fun PrivateInput(label: String,value: String,onChange: (String)->Unit) {
    val changed by rememberUpdatedState(onChange)
    AndroidView(modifier=Modifier.fillMaxWidth().heightIn(min=56.dp),factory={ context -> EditText(context).apply {
        hint=label; contentDescription=label; isSaveEnabled=false; isLongClickable=false; setTextIsSelectable(false)
        importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        if(android.os.Build.VERSION.SDK_INT>=30) importantForContentCapture=View.IMPORTANT_FOR_CONTENT_CAPTURE_NO_EXCLUDE_DESCENDANTS
        inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        imeOptions=EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING or EditorInfo.IME_FLAG_NO_EXTRACT_UI
        filters=arrayOf(android.text.InputFilter.LengthFilter(if(label=="Question") 4000 else if(label.startsWith("Search")) 100 else 16000))
        val noMenu=object: ActionMode.Callback {
            override fun onCreateActionMode(mode:ActionMode?,menu:Menu?)=false
            override fun onPrepareActionMode(mode:ActionMode?,menu:Menu?)=false
            override fun onActionItemClicked(mode:ActionMode?,item:MenuItem?)=false
            override fun onDestroyActionMode(mode:ActionMode?)=Unit
        }
        customSelectionActionModeCallback=noMenu; customInsertionActionModeCallback=noMenu
        doAfterTextChanged { changed(it?.toString().orEmpty()) }
    } },update={ if(it.text.toString()!=value) it.setText(value) })
}


