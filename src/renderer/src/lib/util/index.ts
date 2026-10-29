export function serialFromBleName(displayName: string): string {
    const index = displayName.indexOf("-");
    return index >= 0 ? displayName.slice(index + 1) : displayName;
}