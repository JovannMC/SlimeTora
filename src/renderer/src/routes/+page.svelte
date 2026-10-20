<script lang="ts">
    import { appState } from "#lib/stores/app.svelte";

    $effect(() => {
        void appState.load();
    });
</script>

<main class="p-8 font-body">
    <h1 class="text-2xl font-semibold">SlimeTora</h1>

    {#if appState.loading}
        <p class="mt-6 text-text-alt">Loading…</p>
    {:else if appState.error}
        <p class="mt-6 text-red-400">{appState.error}</p>
    {:else if appState.info}
        <dl class="mt-6 grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
            <dt class="text-text-alt">Version</dt>
            <dd>{appState.info.version}</dd>
            <dt class="text-text-alt">Electron</dt>
            <dd>{appState.info.electronVersion}</dd>
            <dt class="text-text-alt">Chrome</dt>
            <dd>{appState.info.chromeVersion}</dd>
            <dt class="text-text-alt">Node</dt>
            <dd>{appState.info.nodeVersion}</dd>
            <dt class="text-text-alt">Platform</dt>
            <dd>{appState.info.platform}</dd>
            <dt class="text-text-alt">Packaged</dt>
            <dd>{appState.info.isPackaged}</dd>
        </dl>

        {#if appState.capabilities}
            <h2 class="mt-6 text-lg font-medium">Capabilities</h2>
            <ul class="mt-2 text-sm">
                {#each Object.entries(appState.capabilities) as [name, status]}
                    <li>
                        <span class="inline-block w-40 text-text-alt">{name}</span>
                        <span class={status.available ? "text-green-400" : "text-red-400"}>
                            {status.available ? "available" : (status.reason ?? "unavailable")}
                        </span>
                    </li>
                {/each}
            </ul>
        {/if}
    {/if}
</main>
