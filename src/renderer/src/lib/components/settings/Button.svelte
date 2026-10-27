<script lang="ts">
	import Icon from "@iconify/svelte";

	const backgrounds = {
		primary: "bg-primary hover:bg-primary/70 active:bg-primary/50",
		secondary: "bg-secondary hover:bg-secondary/70 active:bg-secondary/50",
		tertiary: "bg-tertiary hover:bg-tertiary/70 active:bg-tertiary/50",
		quaternary: "bg-quaternary hover:bg-tertiary/60 active:bg-tertiary/30",
		button: "bg-button hover:bg-button/70 active:bg-button/50",
		danger: "bg-red-500 hover:bg-red-500/70 active:bg-red-500/50",
	};

	type Props = {
		label: string;
		className?: string;
		icon?: string;
		iconPosition?: "left" | "right";
		background?: keyof typeof backgrounds;
		type?: "main" | "onboarding";
		onClick: () => void;
	};

	let {
		label,
		className = "",
		icon,
		iconPosition = "left",
		background = "quaternary",
		type = "main",
		onClick,
	}: Props = $props();
</script>

<button
	class="flex w-full items-center gap-2 rounded-md px-4 py-2 transition-colors {backgrounds[background]} {className}"
	class:button={type === "onboarding"}
	onclick={onClick}
>
	{#if icon && iconPosition === "left"}
		<Icon {icon} width={18} />
	{/if}

	<span class="flex-1 text-center">{label}</span>

	{#if icon && iconPosition === "right"}
		<Icon {icon} width={18} />
	{/if}
</button>
