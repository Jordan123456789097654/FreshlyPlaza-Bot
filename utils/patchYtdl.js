const fs = require('fs');
const path = require('path');

function patchAll() {
    let patched = false;

    // 1. Patch solver/index.js (increase deadline to 30s)
    const solverIndex = path.join(process.cwd(), 'node_modules', '@distube', 'ytdl-core', 'dist', 'solver', 'index.js');
    if (fs.existsSync(solverIndex)) {
        let code = fs.readFileSync(solverIndex, 'utf8');
        if (code.includes('const CALL_DEADLINE_MS = 10_000;')) {
            code = code.replace('const CALL_DEADLINE_MS = 10_000;', 'const CALL_DEADLINE_MS = 30_000;');
            fs.writeFileSync(solverIndex, code, 'utf8');
            console.log('[PATCH] Patched solver/index.js CALL_DEADLINE_MS to 30_000ms');
            patched = true;
        }
    }

    // 2. Patch solver/worker.js (increase timeout to 15s)
    const solverWorker = path.join(process.cwd(), 'node_modules', '@distube', 'ytdl-core', 'dist', 'solver', 'worker.js');
    if (fs.existsSync(solverWorker)) {
        let code = fs.readFileSync(solverWorker, 'utf8');
        if (code.includes('const TIMEOUT_MS = 2000;')) {
            code = code.replace('const TIMEOUT_MS = 2000;', 'const TIMEOUT_MS = 15000;');
            fs.writeFileSync(solverWorker, code, 'utf8');
            console.log('[PATCH] Patched solver/worker.js TIMEOUT_MS to 15_000ms');
            patched = true;
        }
    }

    // 3. Patch resolve.js (gracefully fall back instead of hard crash when worker terminates or times out)
    const resolveJs = path.join(process.cwd(), 'node_modules', '@distube', 'ytdl-core', 'dist', 'resolve.js');
    if (fs.existsSync(resolveJs)) {
        let code = fs.readFileSync(resolveJs, 'utf8');
        const s1 = 'const player = client.needsPlayer ? await loadPlayer({ fetch: innertube.fetch, playerId, signal }) : undefined;';
        const r1 = `let player = undefined;
            if (client.needsPlayer) {
                try {
                    player = await loadPlayer({ fetch: innertube.fetch, playerId, signal });
                } catch (pErr) {
                    // Graceful fallback: continue without player so unencrypted formats stream normally
                }
            }`;

        const s2 = 'if (!player && inputs.some((input) => input.signatureCipher)) {\n                throw new YtdlError("PLAYER_SOLVE_FAILED", `${client.name} sent ciphered formats but no player was loaded`);\n            }';
        const r2 = 'if (!player && inputs.some((input) => input.signatureCipher)) {\n                // Allow unencrypted stream formats\n            }';

        const s3 = 'const outputs = player ? await player.solve(inputs) : inputs.map((input) => input.url);';
        const r3 = `let outputs = inputs.map((input) => input.url);
            if (player) {
                try {
                    outputs = await player.solve(inputs);
                } catch (sErr) {
                    // Output raw URLs
                }
            }`;

        if (code.includes(s1)) {
            code = code.replace(s1, r1);
            if (code.includes(s2)) code = code.replace(s2, r2);
            if (code.includes(s3)) code = code.replace(s3, r3);
            fs.writeFileSync(resolveJs, code, 'utf8');
            console.log('[PATCH] Patched resolve.js with graceful solver fallback');
            patched = true;
        }
    }

    return patched;
}

patchAll();
module.exports = patchAll;
