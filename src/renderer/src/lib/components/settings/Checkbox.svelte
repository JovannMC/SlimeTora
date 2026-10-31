<script lang="ts">
	import Icon from "@iconify/svelte";
	import clsx from "clsx";
	import Tooltip, { type TooltipPosition } from "./Tooltip.svelte";

	type Props = {
		label: string;
		checked?: boolean;
		tooltip?: string;
		tooltipPosition?: TooltipPosition;
		tooltipWidth?: string;
		disabled?: boolean;
	};

	let {
		label,
		checked = $bindable(false),
		tooltip,
		tooltipPosition,
		tooltipWidth,
		disabled = false,
	}: Props = $props();
</script>

<label class="relative flex cursor-pointer items-center gap-3">
	<input type="checkbox" class="peer sr-only" bind:checked {disabled} />
	<div
		class={clsx(
			"flex h-5 w-5 items-center justify-center rounded border-4 border-panel bg-panel transition peer-checked:bg-primary",
			disabled && "disabled",
		)}
	>
		<div class="flex h-4.5 w-4.5 items-center justify-center rounded">
			<div
				class={clsx(
					"flex h-full w-full items-center justify-center rounded border-2 transition",
					checked ? "border-secondary" : "border-secondary/60",
				)}
			>
				<Icon
					icon="ri:check-fill"
					class={clsx("h-4 w-4 text-white transition-opacity", checked ? "opacity-100" : "opacity-0")}
				/>
			</div>
		</div>
	</div>
	<span class="flex items-center gap-2 font-medium">
		{label}
		{#if tooltip}
			<Tooltip content={tooltip} icon="ri:information-line" position={tooltipPosition} width={tooltipWidth} />
		{/if}
	</span>
</label>
