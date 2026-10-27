<script lang="ts">
	type Props = {
		label?: string;
		selected?: boolean;
		className?: string;
	};

	let { label, selected = $bindable(false), className = "" }: Props = $props();
	const id = $props.id();
</script>

<div class="relative flex items-center gap-3 {className}">
	<input {id} type="checkbox" class="sr-only" bind:checked={selected} />
	<label
		for={id}
		class="relative h-5 w-10 cursor-pointer rounded-full transition-colors duration-200 {selected
			? 'bg-primary'
			: 'bg-quaternary'}"
	>
		<span
			class="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-all duration-200 {selected
				? 'translate-x-5'
				: 'translate-x-0.5'}"
		></span>
	</label>
	<span class="font-medium select-none">{label}</span>
</div>
