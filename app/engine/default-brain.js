'use strict';
// Local provider selection. Explicit API/Codex backends fail closed on authentication or
// transport errors. Legacy pins may fall back to Claude only before a command starts.

// The persisted pin is only ever a sanitized provider-id string: [a-z0-9-] only, empty → null. Single-sourced so the
// load path, the setter, and the unit test all agree; a hostile value can never smuggle a path/flag/newline into the
// state file, and a value that sanitizes to empty degrades to "no pin" (the byte-identical default).
function sanitizeBrainId(id) {
  const clean = (typeof id === 'string' && id) ? id.replace(/[^a-z0-9-]/g, '') : '';
  return clean || null;
}

// nativeDefaultResult(nativeDefault, text, deps) -> brain.ask-shaped result | null.
// deps: {
//   routeOverride(text) -> truthy when THIS turn carries an explicit "/opus …" per-turn override,
//   findProvider(list, id) -> registry entry | null,
//   providers() -> the live provider list,
//   pickAdapter(entry) -> adapter info | null (null = a CLI-only/subscription entry),
//   secretNeeded(entry) -> { env } | null,
//   hasSecret(env) -> boolean,
//   resetStream({ model }) -> void (overlay clears + associates this turn's stream; also the daemon's turn bookkeeping),
//   runNativeTurn({ text, providerId, model, onDelta, onThinking }) -> Promise<{ ok, text, model, usage:{inTok,outTok}, ... }>,
//   onDelta(text) / onThinking(text) -> void stream sinks,
//   now() -> ms clock,
// }
async function nativeDefaultResult(nativeDefault, text, deps) {
  if (!nativeDefault) return null;                                  // not pinned → never entered (the byte-identical default)
  if (deps.routeOverride(text)) return null;                       // explicit "/opus …" wins the subscription tier for THIS turn
  const entry = deps.findProvider(deps.providers(), nativeDefault);
  const failed = (error, model) => ({ text: error || 'The selected provider could not finish this turn.', error, model: model || (entry && entry.big_model) || nativeDefault, ms: 0, aborted: false, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 } });
  if (!entry) return failed('Selected provider ' + nativeDefault + ' is no longer available. Choose a provider in Settings.');
  const strict = entry.backend === 'native' || entry.backend === 'codex';
  if (!deps.pickAdapter(entry)) return strict ? failed('The selected provider backend is unavailable.') : null;
  const need = deps.secretNeeded(entry);
  if (need && !deps.hasSecret(need.env)) return strict ? failed('Provider ' + entry.id + ' needs its API key. Configure it in Settings or urfael model use ' + entry.id + '.') : null;              // keyless pin degrades gracefully to the subscription until a key is set
  try { deps.resetStream({ model: entry.big_model || entry.small_model || '' }); } catch {}   // overlay clears + associates the stream (parity with the CLI path)
  const t0 = deps.now();
  let r;
  try {
    r = await deps.runNativeTurn({
      text, providerId: entry.id, model: '',
      onDelta: deps.onDelta, onThinking: deps.onThinking,
    });
  } catch { return strict ? failed('The selected provider could not finish this turn.') : null; }                                          // runNativeTurn never throws; guard anyway → fall through (fail-soft)
  if (!r || !r.ok || !r.text) return strict || (r && r.sideEffects) ? failed((r && r.error) || 'The selected provider could not finish this turn.', r && r.model) : null;                         // provider/build/native error → fall through to the CLI (fail-soft). runNativeTurn only records on success, so falling through never double-records.
  // MAP to brain.ask's exact contract so the reply flows through the /ask consumer (the selfset self-rewrite scan)
  // unchanged. runNativeTurn already did transcript.push + recordSession + logEvent('native_turn'); the native path
  // deliberately scopes out the CLI-tail reviewTurn/modelUser/reinforceSurfaced (documented v1 limitation).
  return {
    text: r.text, model: r.model, ms: deps.now() - t0, aborted: false,
    usage: {
      input_tokens: (r.usage && r.usage.inTok) || 0,
      output_tokens: (r.usage && r.usage.outTok) || 0,
      cache_read_input_tokens: (r.usage && r.usage.cacheReadTok) || 0,
    },
  };
}

// Fresh CLI/API runs still need the current conversation. Limit recent plain-text
// turns separately from recalled memory; never replay old tool calls as actions.
function recentHistory(transcript) {
  return (Array.isArray(transcript) ? transcript : []).slice(-4).flatMap((turn) => {
    if (!turn || typeof turn.user !== 'string' || typeof turn.urfael !== 'string') return [];
    return [{ role: 'user', content: turn.user.slice(0, 4000) }, { role: 'assistant', content: turn.urfael.slice(0, 4000) }];
  });
}

module.exports = { sanitizeBrainId, nativeDefaultResult, recentHistory };
