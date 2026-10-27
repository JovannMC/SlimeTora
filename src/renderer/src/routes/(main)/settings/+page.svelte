<script lang="ts">
	import ProgramSettings from "#lib/components/settings/sections/ProgramSettings.svelte";
	import ConnectionSettings from "#lib/components/settings/sections/ConnectionSettings.svelte";
	import TrackerSettings from "#lib/components/settings/sections/TrackerSettings.svelte";
	import AdvancedSettings from "#lib/components/settings/sections/AdvancedSettings.svelte";
</script>

<div class="flex flex-col gap-8 p-4">
	<ProgramSettings />
	<ConnectionSettings />
	<TrackerSettings />
	<AdvancedSettings />
</div>
