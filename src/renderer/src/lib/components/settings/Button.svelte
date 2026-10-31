<script lang="ts">
	import Icon from "@iconify/svelte";
	import clsx from "clsx";

	const backgrounds = {
		primary: "bg-primary hover:bg-primary/70 active:bg-primary/50",
		secondary: "bg-secondary hover:bg-secondary/70 active:bg-secondary/50",
		tertiary: "bg-tertiary hover:bg-tertiary/70 active:bg-tertiary/50",
		quaternary: "bg-quaternary hover:bg-tertiary/60 active:bg-tertiary/30",
		button: "bg-button hover:bg-button/70 active:bg-button/50",
		danger: "bg-red-500 hover:bg-red-500/70 active:bg-red-500/50",
		warning: "bg-yellow-500 hover:bg-yellow-500/70 active:bg-yellow-500/50",
	};

	type Props = {
		label?: string;
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
	class={clsx(
		"flex w-full items-center gap-2 transition-colors",
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
		<Icon {icon} width={rounded ? 24 : 18} />
	{/if}

	{#if label}
		<span class="flex-1 text-center">{label}</span>
	{/if}

	{#if icon && iconPosition === "right"}
		<Icon {icon} width={rounded ? 24 : 18} />
	{/if}
</button>
