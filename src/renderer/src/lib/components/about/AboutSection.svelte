<script lang="ts">
	import type { Snippet } from "svelte";
	import Icon from "@iconify/svelte";

	let {
		icon,
		title,
		panelClass = "gap-4",
		children,
	}: { icon: string; title: string; panelClass?: string; children: Snippet } = $props();
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center gap-2 font-heading text-xl">
		<Icon {icon} class="text-secondary" width={20} />
		{title}
	</div>
	<div class="flex min-w-84.5 flex-col rounded-xl bg-panel p-4 shadow {panelClass}">
		{@render children()}
	</div>
</div>
