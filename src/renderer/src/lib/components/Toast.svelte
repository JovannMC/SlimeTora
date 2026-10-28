<!-- HAHA STOLEN ONCE AGAIN FROM https://github.com/VERT-sh/VERT (because i wrote it)  -->
<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import { quintOut } from "svelte/easing";
	import Icon from "@iconify/svelte";
	import { ToastManager, type Toast } from "#lib/util/toast.svelte";

	let { toast }: { toast: Toast<unknown> } = $props();

	// full class names so tailwind generates them
	const variants = {
		success: { classes: "bg-purple-300 border-purple-500", icon: "ri:check-fill" },
		error: { classes: "bg-red-300 border-red-500", icon: "ri:close-circle-fill" },
		info: { classes: "bg-blue-300 border-blue-500", icon: "ri:information-fill" },
		warning: { classes: "bg-pink-300 border-pink-500", icon: "ri:alert-fill" },
	};

	const variant = $derived(variants[toast.type]);
	const additional = $derived("additional" in toast ? toast.additional : undefined);
</script>

<div
	class="flex max-w-sm items-center justify-between gap-4 rounded-lg border-l-4 p-4 shadow-md {variant.classes}"
	in:fly={{ duration: toast.durations.enter, easing: quintOut, x: 0, y: 100 }}
	out:fade={{ duration: toast.durations.exit, easing: quintOut }}
>
	<div class="flex items-center gap-4">
		<Icon icon={variant.icon} class="h-6 w-6 shrink-0 text-black" width="32" stroke="2" fill="none" />
		<div class="font-normal whitespace-pre-wrap text-black">
			{#if typeof toast.message === "string"}
				{toast.message}
			{:else}
				{@const MessageComponent = toast.message}
				<MessageComponent
					durations={toast.durations}
					id={toast.id}
					message={toast.message}
					type={toast.type}
					{additional}
				/>
			{/if}
		</div>
	</div>
	<button class="shrink-0 text-gray-600 hover:text-black" onclick={() => ToastManager.remove(toast.id)}>
		<Icon width="16" icon="ri:close-line" />
	</button>
</div>
