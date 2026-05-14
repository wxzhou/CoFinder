# Column View Decision

Decision for V2.7: defer real Column View to a later milestone.

Rationale:

- The current list view remains the reliable daily workflow.
- Remote edit reliability and task-center clarity have higher value than a second navigation model.
- A correct remote column view needs per-column async loading, cancellation, keyboard focus rules, and error states. Shipping a partial toggle would recreate the misleading affordance removed in V2.4.

Future implementation requirements:

- Keep list view as the default.
- Add per-pane view-mode state only when both local and remote column traversal are implemented.
- Support remote cancellation and per-column loading/error placeholders.
- Include keyboard navigation and screenshot/layout checks before exposing the control.
