# DevilX DM Flow UI update

Updated:
- app/dashboard/automations/new/AutomationFlowEditor.tsx

The UI now explains the flow as:
1. Message
2. Button
3. Action

Each button has a simple two-option action switch:
- Main link
- Flow

Flow buttons select the next message.

Current link tracking behavior in the existing webhook:
- The first valid Main Link found in the flow is eligible for tracking.
- It is actually wrapped in the tracking redirect only when Follow-up is enabled and a follow-up message exists.
- Other Main Links are sent directly to their destination URL.
- Flow buttons are not click-tracked by the current implementation.
- The tracking redirect records clicked_at in instagram_automation_link_clicks and then redirects to target_url.
