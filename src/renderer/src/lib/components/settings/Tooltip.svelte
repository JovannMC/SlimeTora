<script lang="ts">
	import Icon from "@iconify/svelte";
	import { fade } from "svelte/transition";

	export type TooltipPosition = "up" | "down" | "left" | "right";

	type Props = {
		content: any;
		icon?: string;
		position?: TooltipPosition;
		width?: string;
		children?: any;
	};

	let { content, icon, position = "up", width = "250px", children }: Props = $props();

	const GAP = 8;
	const POSITIONS: TooltipPosition[] = ["up", "down", "left", "right"];

	let showTooltip = $state(false);
	let hoverable: HTMLElement;
	let tooltipEl: HTMLElement | undefined = $state();
	let tooltipStyle = $state({ top: 0, left: 0 });
	// svelte-ignore state_referenced_locally - position the preferred position, gets updated if it doesn't fit in viewport
	let placement: TooltipPosition = $state(position);

	function fits(pos: TooltipPosition, trigger: DOMRect, tip: DOMRect) {
		switch (pos) {
			case "up":
				return trigger.top - tip.height - GAP > 0;
			case "down":
				return trigger.bottom + tip.height + GAP < window.innerHeight;
			case "left":
				return trigger.left - tip.width - GAP > 0;
			case "right":
				return trigger.right + tip.width + GAP < window.innerWidth;
		}
	}

	function anchor(pos: TooltipPosition, trigger: DOMRect, tip: DOMRect) {
		const centerX = trigger.left + trigger.width / 2 - tip.width / 2;
		const centerY = trigger.top + trigger.height / 2 - tip.height / 2;
		switch (pos) {
			case "up":
				return { top: trigger.top - tip.height - GAP, left: centerX };
			case "down":
				return { top: trigger.bottom + GAP, left: centerX };
			case "left":
				return { top: centerY, left: trigger.left - tip.width - GAP };
			case "right":
				return { top: centerY, left: trigger.right + GAP };
		}
	}

	function updateTooltipPosition() {
		if (!hoverable || !tooltipEl) return;
		const trigger = hoverable.getBoundingClientRect();
		const tip = tooltipEl.getBoundingClientRect();

		// use the preferred side if it fits, otherwise the first side that does
		const chosen = fits(position, trigger, tip)
			? position
			: (POSITIONS.filter((p) => p !== position).find((p) => fits(p, trigger, tip)) ?? position);

		const { top, left } = anchor(chosen, trigger, tip);

		// keep the tooltip on screen
		tooltipStyle = {
			top: Math.max(8, Math.min(window.innerHeight - tip.height - 8, top)),
			left: Math.max(8, Math.min(window.innerWidth - tip.width - 8, left)),
		};
		placement = chosen;
	}

	$effect(() => {
		if (showTooltip) setTimeout(updateTooltipPosition, 0);
	});
</script>

<div
	class="relative inline-block"
	onmouseenter={() => (showTooltip = true)}
	onmouseleave={() => (showTooltip = false)}
	bind:this={hoverable}
	role="tooltip"
>
	{#if icon}
		<Icon {icon} width={20} class="cursor-pointer text-text-alt hover:text-text" />
	{:else}
		{@render children()}
	{/if}

	{#if showTooltip}
		<div
			bind:this={tooltipEl}
			class="fixed z-9999"
			style="top: {tooltipStyle.top}px; left: {tooltipStyle.left}px; width: {width};"
			role="tooltip"
			transition:fade={{ duration: 150 }}
		>
			<div class="relative">
				<div
					class="relative rounded-md border-2 border-secondary/80 bg-quaternary px-3 py-2 text-sm shadow-lg"
					class:tooltip-up={placement === "up"}
					class:tooltip-down={placement === "down"}
					class:tooltip-left={placement === "left"}
					class:tooltip-right={placement === "right"}
				>
					{content}
				</div>
			</div>
		</div>
	{/if}
</div>

<!--
	code partially "stolen" from https://github.com/VERT-sh/VERT
	it's "stolen".. because I wrote it
-->
<style>
	@reference "../../../app.css";

	/* Base arrow styles */
	.tooltip-up::after,
	.tooltip-down::after,
	.tooltip-left::after,
	.tooltip-right::after,
	.tooltip-up::before,
	.tooltip-down::before,
	.tooltip-left::before,
	.tooltip-right::before {
		content: "";
		position: absolute;
		pointer-events: none;
	}

	/* Up tooltip arrows */
	.tooltip-up::before {
		bottom: -10px;
		left: 50%;
		margin-left: -10px;
		border-width: 10px 10px 0;
		border-style: solid;
		@apply border-transparent border-t-secondary/80;
	}

	.tooltip-up::after {
		bottom: -7px;
		left: 50%;
		margin-left: -8px;
		border-width: 8px 8px 0;
		border-style: solid;
		border-color: var(--color-quaternary) transparent transparent transparent;
		@apply border-transparent border-t-quaternary;
	}

	/* Down tooltip arrows */
	.tooltip-down::before {
		top: -10px;
		left: 50%;
		margin-left: -10px;
		border-width: 0 10px 10px;
		border-style: solid;
		@apply border-transparent border-b-secondary/80;
	}

	.tooltip-down::after {
		top: -7px;
		left: 50%;
		margin-left: -8px;
		border-width: 0 8px 8px;
		border-style: solid;
		@apply border-transparent border-b-quaternary;
	}

	/* Left tooltip arrows */
	.tooltip-left::before {
		right: -10px;
		top: 50%;
		margin-top: -10px;
		border-width: 10px 0 10px 10px;
		border-style: solid;
		@apply border-transparent border-l-secondary/80;
	}

	.tooltip-left::after {
		right: -7px;
		top: 50%;
		margin-top: -8px;
		border-width: 8px 0 8px 8px;
		border-style: solid;
		@apply border-transparent border-l-quaternary;
	}

	/* Right tooltip arrows */
	.tooltip-right::before {
		left: -10px;
		top: 50%;
		margin-top: -10px;
		border-width: 10px 10px 10px 0;
		border-style: solid;
		@apply border-transparent border-r-secondary/80;
	}

	.tooltip-right::after {
		left: -7px;
		top: 50%;
		margin-top: -8px;
		border-width: 8px 8px 8px 0;
		border-style: solid;
		@apply border-transparent border-r-quaternary;
	}
</style>
