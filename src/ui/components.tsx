import React from 'react';
import { View } from 'react-native';

/**
 * Lucide icons, resolved lazily by name.
 *
 * lucide-react-native ships every glyph; requiring the module once and
 * caching the resolved component keeps a name lookup off the render
 * path, and an unknown name degrades to an empty box rather than
 * crashing the screen that asked for it.
 */
const LucideIcons: Record<string, React.ComponentType<any>> = {};

function Fallback() {
  return <View style={{ width: 24, height: 24 }} />;
}

function getLucideIcon(name: string) {
  if (!LucideIcons[name]) {
    try {
      const module = require('lucide-react-native');
      const pascalName = name
        .split('-')
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      LucideIcons[name] = module[pascalName] || module[name] || Fallback;
    } catch {
      LucideIcons[name] = Fallback;
    }
  }
  return LucideIcons[name];
}

export function LucideIcon({
  name,
  size = 24,
  color,
  strokeWidth = 2,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: object;
}) {
  const Icon = getLucideIcon(name);
  return <Icon size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}

export default LucideIcon;
