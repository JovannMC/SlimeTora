<script lang="ts">
	import Icon from "@iconify/svelte";
	import clsx from "clsx";
	import Tooltip, { type TooltipPosition } from "./Tooltip.svelte";

	type Props = {
		label?: string;
		className?: string;
		selectClassName?: string;
		options: { value: string; label: string }[];
		selected: string;
		onChange?: (value: string) => void;
		tooltip?: string;
		tooltipPosition?: TooltipPosition;
		tooltipWidth?: string;
		icon?: string;
		disabled?: boolean;
	};

	let {
		label,
		className = "",
		selectClassName = "",
		options,
		selected = $bindable(),
		onChange,
		tooltip,
		tooltipPosition,
		tooltipWidth,
		icon,
		disabled = false,
	}: Props = $props();
	const id = $props.id();
</script>

<div class={clsx("flex flex-col gap-2", className)}>
	{#if label || tooltip}
		<div class="flex flex-row items-center gap-2">
			{#if label}
				<label class="font-medium" for={id}>{label}</label>
			{/if}
			{#if tooltip}
				<Tooltip content={tooltip} icon="ri:information-line" position={tooltipPosition} width={tooltipWidth} />
			{/if}
		</div>
	{/if}
	<div class="relative w-full">
		{#if icon}
			<Icon {icon} width={18} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
		{/if}
		<select
			{id}
			bind:value={selected}
			{disabled}
			onchange={() => onChange?.(selected)}
			class={clsx(
				"w-full appearance-none rounded-md bg-quaternary px-3 py-2 pr-8 transition-shadow focus:outline-none",
				disabled && "disabled",
				selectClassName,
			)}
			style="padding-left: {icon ? '2.5rem' : '0.75rem'}"
		>
			{#each options as option}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
		<Icon
			icon="ri:arrow-down-s-line"
			class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-text-alt"
			width={20}
		/>
	</div>
</div>
