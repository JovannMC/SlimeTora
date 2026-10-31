<script lang="ts">
	import Icon from "@iconify/svelte";
	import clsx from "clsx";
	import Tooltip, { type TooltipPosition } from "./Tooltip.svelte";

	type Props = {
		label: string;
		value: string | number;
		type?: "text" | "number";
		placeholder?: string;
		icon?: string;
		className?: string;
		tooltip?: string;
		tooltipPosition?: TooltipPosition;
		tooltipWidth?: string;
		disabled?: boolean;
	};

	let {
		label,
		value = $bindable(),
		type = "text",
		placeholder,
		icon,
		className = "",
		tooltip,
		tooltipPosition,
		tooltipWidth,
		disabled = false,
	}: Props = $props();
	const id = $props.id();

	function onInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		value = type === "number" ? Number(input.value) : input.value;
	}
</script>

<div class={clsx("flex flex-col gap-2", className)}>
	<div class="flex flex-row items-center gap-2">
		<label class="font-medium" for={id}>{label}</label>
		{#if tooltip}
			<Tooltip content={tooltip} icon="ri:information-line" position={tooltipPosition} width={tooltipWidth} />
		{/if}
	</div>
	<div class="relative w-full">
		<input
			{id}
			{type}
			{value}
			{placeholder}
			{disabled}
			oninput={onInput}
			class={clsx(
				"w-full rounded-md bg-quaternary px-3 py-2 transition-shadow focus:ring-2 focus:ring-secondary focus:outline-none",
				disabled && "disabled",
			)}
		/>
		{#if icon}
			<Icon
				{icon}
				class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-alt"
				width={18}
			/>
		{/if}
	</div>
</div>

<style>
	/* hide number input spinners on hover */
	input[type="number"]:hover {
		-moz-appearance: textfield;
		appearance: textfield;
	}
	input[type="number"]::-webkit-inner-spin-button,
	input[type="number"]::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
