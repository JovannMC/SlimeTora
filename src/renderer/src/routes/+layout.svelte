<script lang="ts">
    import type { Snippet } from "svelte";
    import "../app.css";
    import "@fontsource/chakra-petch";
    import { registerBridge } from "#lib/api/bridge";
    import { electronBridge } from "#lib/api/electronBridge";

    registerBridge(electronBridge);

    let { children }: { children: Snippet } = $props();
</script>

<div class="app-shell">
    {@render children()}
</div>
