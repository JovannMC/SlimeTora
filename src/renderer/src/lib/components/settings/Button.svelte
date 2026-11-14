<script lang="ts">
	import Icon from "@iconify/svelte";
	import clsx from "clsx";

	const backgrounds = {
		primary: "bg-primary text-on-primary hover:bg-primary/70 active:bg-primary/50",
		secondary: "bg-secondary text-on-secondary hover:bg-secondary/70 active:bg-secondary/50",
		tertiary: "bg-tertiary text-on-tertiary hover:bg-tertiary/70 active:bg-tertiary/50",
		quaternary: "bg-quaternary text-on-quaternary hover:bg-tertiary/60 active:bg-tertiary/30",
		button: "bg-button text-on-button hover:bg-button/70 active:bg-button/50",
		danger: "bg-red-500 text-white hover:bg-red-500/70 active:bg-red-500/50",
		warning: "bg-yellow-500 text-black hover:bg-yellow-500/70 active:bg-yellow-500/50",
	};

	type Props = {
		label?: string;
		ariaLabel?: string;
		className?: string;
		icon?: string;
		iconPosition?: "left" | "right";
		background?: keyof typeof backgrounds;
		rounded?: boolean;
		type?: "main" | "onboarding";
		onClick: () => void;
		disabled?: boolean;
	};

	let {
		label,
		ariaLabel,
		className = "",
		icon,
		iconPosition = "left",
		background = "quaternary",
		rounded = false,
		type = "main",
		onClick,
		disabled = false,
	}: Props = $props();
</script>

<button
	aria-label={ariaLabel ?? (!label && icon ? icon : undefined)}
	class={clsx(
		"flex w-full items-center gap-2 transition-colors focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-secondary",
		rounded ? "rounded-full p-3" : "rounded-md px-4 py-2",
		backgrounds[background],
		{ button: type === "onboarding" },
		disabled && "disabled",
		className,
	)}
	{disabled}
	onclick={onClick}
>
	{#if icon && iconPosition === "left"}
		<Icon {icon} width={rounded ? 24 : 18} class="shrink-0" />
	{/if}

	{#if label}
		<span class="flex-1 text-center">{label}</span>
	{/if}

	{#if icon && iconPosition === "right"}
		<Icon {icon} width={rounded ? 24 : 18} class="shrink-0" />
	{/if}
</button>
