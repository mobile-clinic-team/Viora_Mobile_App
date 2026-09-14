# Project structure

One application module rooted directly in Viora-Mobile-App; no extra nested VioraMobile project. [ARCHITECTURE.md](ARCHITECTURE.md) owns versions, variants and dependency lifetimes. The tree below defines the complete placement convention; [implementation evidence](FOUNDATION-IMPLEMENTATION.md) identifies the existing foundation subset. Other feature paths remain future work.

## One feature placement convention

~~~text
Viora-Mobile-App/
  settings.gradle.kts
  build.gradle.kts
  gradle.properties
  gradle/libs.versions.toml
  gradle/wrapper/gradle-wrapper.properties
  gradle/wrapper/gradle-wrapper.jar
  gradlew
  gradlew.bat
  app/build.gradle.kts
  app/src/main/AndroidManifest.xml
  app/src/main/res/xml/{backup_rules,data_extraction_rules,network_security_config}.xml
  app/src/main/java/com/viora/mobile/
    VioraApplication.kt
    MainActivity.kt
    app/{AppGraph,AppNavHost,Destination,AppViewModel}.kt
    core/model/{Ids,VersionToken,ApiResult}.kt
    core/network/{ApiClient,ApiError,RequestContext,JsonConfig}.kt
    core/session/{SessionCoordinator,SessionState,SessionAuthGateway,WorkspaceGateway,AuthenticatedRequestExecutor,User,WorkspaceContext}.kt
    core/security/{SecureStore,KeystoreSecureStore,PrivacyController,RedactedLogger}.kt
    core/operations/{OperationCoordinator,OperationReceipt,OperationRepository}.kt
    core/time/{AppClock,SystemAppClock}.kt
    core/ui/{LoadingPane,ErrorPane,ConfirmationSheet,Theme}.kt
    feature/
      auth/{domain,data,ui}/
      workspace/{domain,data,ui}/
      patients/{domain,data,ui}/
      doctors/{domain,data,ui}/
      appointments/{domain,data,ui}/
      clinical/{domain,data,ui}/
      assistant/{domain,data,ui}/
      account/ui/
  app/src/devDebug/java/com/viora/mobile/dev/
    {DevFixtureGraph,FakeSessionRepository,FakeWorkspaceRepository}.kt
  app/src/test/java/com/viora/mobile/
    core/{network,session,operations,security}/
    feature/{auth,workspace,patients,appointments,clinical,assistant}/
    testutil/{FakeClock,FakeSecureStore,MainDispatcherRule,FixtureLoader}.kt
  app/src/test/resources/fixtures/{auth,workspace,operations,errors}/
  app/src/androidTest/java/com/viora/mobile/{navigation,privacy,session,feature}/
  app/src/androidTest/AndroidManifest.xml
  docs/
~~~

Within EVERY feature:

- domain/ holds immutable client models and public repository interfaces. domain/usecase/ exists only for justified multi-call workflows.
- data/ holds Http<Feature>Repository and mappers; data/dto/ owns transport serialization types.
- ui/ holds <Screen>ViewModel, <Screen>UiState, <Screen>Intent and Compose screens/components together.
- No root ui/<feature>, no separate root state package, no server-shaped repository ports or DTOs in core/model.
- Shared clinical content may be referenced through feature/clinical/domain/ClinicalContent by assistant/domain; assistant cannot import clinical/data or clinical/ui. Cross-feature contracts must be listed in the consuming use case.
- core/operations can store only generic resource type/reference metadata; it never imports a feature's clinical model.
- app composes actual feature implementations; production sources never import testutil or devDebug fixtures.

User and the workspace/membership/context value types are shared plain Kotlin models in core/session (WorkspaceSummary, Location, Workspace and Membership alongside WorkspaceContext). Auth/workspace features reference these definitions rather than defining competing copies. Their DTOs remain in their owning feature/data/dto. Core SessionAuthGateway and WorkspaceGateway expose only these core values and session token types; their HTTP implementations live in auth/data and workspace/data respectively. No core class imports a feature repository or DTO.

Ordinary feature repositories receive AuthenticatedRequestExecutor through constructors. The two session gateway adapters receive raw ApiClient to avoid a session/HTTP construction or refresh cycle; ARCHITECTURE defines the wiring order. UI receives ViewModels through explicit factories in AppGraph/NavHost. Public interfaces return domain values and typed ApiResult; implementation details are internal. Domain interfaces contain no Android Activity/Context or raw OkHttp response.

## Boundary and testing placement

JVM test source paths mirror production package paths. Instrumented Android/Compose/Keystore tests belong in androidTest, not test. Disposable MockWebServer tests belong in test. Synthetic demo fakes live only in devDebug, while test-specific fakes live in test source sets; neither can be referenced by prodRelease.

The session and operation coordinators are application-scoped. Feature ViewModels are destination-scoped. There is no hidden singleton patient cache. Constructor wiring is the explicit dependency map and is reviewed for core-to-feature/private-feature violations.

## Build/config placement

Environment flavors and allowed variants are fixed in ARCHITECTURE. Public configuration values are supplied to BuildConfig per enabled variant; no secret in Gradle source. An illustrative invalid origin may be used only in fake mode and must never receive network traffic. Real callback origins/registrations are BD-06.

Future manifest/exported settings: only the launcher Activity and validated OAuth App Link entry are externally reachable; they dispatch into the session gate and never deep-link into PHI. Protected destinations have no public deep-link intent filters. Backup/transfer/TLS policies are explicit XML files and device-tested.

Do not scaffold every feature during the foundation batch. The full layout is a placement contract so later engineers add files consistently.
