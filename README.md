# Desktop

Owns window identities, focus, workspaces, geometry, minimize/maximize and close admission. The preserved `active-system/` baseline retains the original full Desktop history and implementation; it is reference source and is not loaded by the new package. Login, account authority, file persistence and guest Linux have separate owners.

`@webos/desktop` exposes `createDesktopController` and synchronous `mount({desktop,authority,...}) -> {element,dispose,ready,inspect,execute}`. Supply explicit account/session identities, an application catalog and an authorizer. Operations carry exact `desktopId` and `sessionId`; windows have independent opaque IDs. The authorizer receives the caller's authority, never an actor-kind string treated as proof. The parent currently binds an in-page human authority. Delegated agent authorization is pending; same-origin code remains trusted.

Apps mount synchronously with instance/session/resource identity and an abort signal. Their explicit `ready` promise controls loading failure. Their optional `requestClose()` must return true before closing; dirty apps without it stay open. Failed/cancelled close requests retain the view. App documents/services remain their owners' responsibility. Removing Desktop's view does not sign out; explicit controller disposal ends its window session. Only one Desktop view mounts for a controller at once.

`node --test tests/*.test.mjs` checks authorization/target refusal, disposal while authorization is pending, independent windows, unsaved-close cancellation/failure and live application routing. The parent actual-browser tests cover composition and public-view operations. Old tiling, roll-up, layout recovery, voice/keyboard policy, menus and full-suite registrations remain preserved and require deliberate port/fidelity tests. Current window controls do not establish full old Desktop parity.

## Live application operations

`inspectApplication(target, caller)` reads a mounted view's public inspection.
`executeApplication({...target, request}, caller)` forwards a captured application
request to that same view's public `execute` function with the unchanged caller
capability. The application's own resource and operation checks still run.
Desktop does not create another document or file implementation.

The target contains exact `desktopId`, `sessionId`, `instanceId` and
`resourceId: 'view:' + instanceId`. This resource identifies the view for routing;
the nested command retains the app's document/file resource identity. Its
instance and session must match the outer target. The authorizer receives
`application.inspect` or `application.execute`, the owned account ID, app ID and a separate copy
of the nested request. A role-name string is not a credential.

Requests are captured before asynchronous permission checks. Structured cloning
preserves explicit Blob input for operations such as upload; metadata is
bounded, while file-byte limits remain the owning component's responsibility.
Shared memory and non-JSON collection types are refused because they do not
provide the captured JSON metadata/owned-byte contract.
Callbacks are captured when a view attaches. Detaching/replacing the view,
closing its window or ending the session invalidates a pending decision. Views
must be ready to provide their own public methods. Unsupported methods fail
explicitly. If a command completes after view removal, its result is reported
as uncertain (`outcome: 'unknown'`); callers must verify before retrying.

The parent exposes these same methods on its assembly handle. Its current
authorizer still accepts only the in-page human capability. Tests using
synthetic caller capabilities establish routing and shared live state, not
Accounts-issued delegation or an authenticated remote agent transport.
