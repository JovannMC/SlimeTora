<script lang="ts">
	import clsx from "clsx";

	type Props = {
		label?: string;
		title?: string;
		selected?: boolean;
		className?: string;
		disabled?: boolean;
	};

	let { label, title, selected = $bindable(false), className = "", disabled = false }: Props = $props();
	const id = $props.id();
</script>

<div class={clsx("relative flex min-w-0 items-center gap-3", className)}>
	<input {id} type="checkbox" class="sr-only" bind:checked={selected} {disabled} />
	<label
		for={id}
		class={clsx(
			"relative h-5 w-10 cursor-pointer rounded-full transition-colors duration-200",
			disabled && "disabled",
			selected ? "bg-primary" : "bg-quaternary",
		)}
	>
		<span
			class={clsx(
				"absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-all duration-200",
				selected ? "translate-x-5" : "translate-x-0.5",
			)}
		></span>
	</label>
	<span class="min-w-0 truncate font-medium select-none" {title}>{label}</span>
</div>
