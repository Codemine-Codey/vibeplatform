// BotID removed — initBotId() here was injecting the client-side challenge script
// (the /…/c.js request) and intercepting the /api/chat POST so generations never
// reached the server (workspace never started, empty console). Re-add bot/abuse
// protection post-launch via a method that does not block the streaming generation
// request. This file is intentionally a no-op for now.
export {}
