// INVISIBLE SELF-HEAL (Fable step 5): the technical error is still routed to the AI (via the
// message data + transformMessages) and fixed in the background, but the heal is NOT rendered
// in chat. Lovable never shows "spotted a display issue / fixing it now" — the preview iframe
// simply refreshes once the fix lands. Rendering nothing keeps the experience honest and calm;
// the generic "working" status already tells the user something is in progress.
export function ReportErrors() {
  return null
}
