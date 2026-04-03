import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text } from 'react-native-paper';

/**
 * Parse AI response and format with markdown-like support
 * Supports: **bold**, numbered lists, bullet points, line breaks
 */
export function parseAiResponse(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Check for bold: **text**
    if (trimmed.includes('**')) {
      const parts = trimmed.split(/\*\*(.+?)\*\*/g);
      let isBold = false;

      return (
        <Text key={`p-${idx}`} style={styles.paragraph}>
          {parts.map((part, i) => {
            if (i % 2 === 1) {
              isBold = !isBold;
              return (
                <Text key={i} style={styles.bold}>
                  {part}
                </Text>
              );
            }
            return <Text key={i}>{part}</Text>;
          })}
        </Text>
      );
    }

    // Check for numbered list: 1. text or - text
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    const bulletMatch = trimmed.match(/^[\-•]\s+(.+)/);

    if (numberedMatch) {
      elements.push(
        <View key={`li-${idx}`} style={styles.listItem}>
          <Text style={styles.listNumber}>{numberedMatch[1]}.</Text>
          <Text style={styles.listContent}>{numberedMatch[2]}</Text>
        </View>
      );
    } else if (bulletMatch) {
      elements.push(
        <View key={`li-${idx}`} style={styles.listItem}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.listContent}>{bulletMatch[1]}</Text>
        </View>
      );
    } else if (trimmed.length > 0) {
      // Regular paragraph
      elements.push(
        <Text key={`p-${idx}`} style={styles.paragraph}>
          {formatInlineText(trimmed)}
        </Text>
      );
    } else if (elements.length > 0 && idx < lines.length - 1) {
      // Empty line as separator
      elements.push(<View key={`sep-${idx}`} style={styles.separator} />);
    }
  });

  return (
    <View style={styles.container}>
      {elements.length > 0 ? elements : <Text style={styles.paragraph}>{content}</Text>}
    </View>
  );
}

/**
 * Format inline text: **bold**, *italic*, `code`
 */
function formatInlineText(text: string): React.ReactNode {
  // Simple approach: split by markers and render with styles
  const boldRegex = /\*\*(.+?)\*\*/g;
  const italicRegex = /\*(.+?)\*/g;
  const codeRegex = /`(.+?)`/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Replace patterns in order of priority
  const patterns = [
    { regex: /\*\*(.+?)\*\*/g, style: styles.bold, wrap: (t: string) => t },
    { regex: /`(.+?)`/g, style: styles.code, wrap: (t: string) => t },
  ];

  let currentText = text;
  for (const pattern of patterns) {
    const matches = Array.from(currentText.matchAll(pattern.regex));
    if (matches.length > 0) {
      let result = currentText;
      for (const match of matches.reverse()) {
        const before = result.slice(0, match.index);
        const matched = match[1];
        const after = result.slice(match.index! + match[0].length);
        result = before + `<${pattern.style || ''}>${matched}</${pattern.style || ''}>` + after;
      }
      currentText = result;
    }
  }

  return <Text style={styles.paragraph}>{currentText}</Text>;
}

/**
 * Animated dot component for loading state
 */
function LoadingDots() {
  const [opacities] = useState([
    new Animated.Value(0.3),
    new Animated.Value(0.6),
    new Animated.Value(1),
  ]);

  useEffect(() => {
    const createAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animValue, {
            toValue: 1,
            duration: 600,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animations = opacities.map((opacity, idx) =>
      createAnimation(opacity, idx * 150)
    );

    animations.forEach((anim) => anim.start());

    return () => {
      animations.forEach((anim) => anim.stop());
    };
  }, [opacities]);

  return (
    <View style={styles.loadingContainer}>
      {opacities.map((opacity, idx) => (
        <Animated.View
          key={idx}
          style={[
            styles.dot,
            {
              opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function AiMessageBubble({
  content,
  isUser,
  isLoading,
  time,
  error,
}: {
  content?: string;
  isUser: boolean;
  isLoading?: boolean;
  time?: string;
  error?: { message: string };
}) {
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      {isLoading ? (
        <LoadingDots />
      ) : error ? (
        <Text style={styles.errorText}>{error.message}</Text>
      ) : (
        parseAiResponse(content || '')
      )}
      {time && <Text style={styles.time}>{time}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1f2937',
    marginBottom: 4,
  },
  bold: {
    fontWeight: 'bold',
    color: '#111827',
  },
  italic: {
    fontStyle: 'italic',
    color: '#4b5563',
  },
  code: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 4,
    gap: 8,
  },
  listNumber: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f2937',
    minWidth: 24,
  },
  bullet: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f2937',
    minWidth: 24,
  },
  listContent: {
    fontSize: 13,
    lineHeight: 18,
    color: '#374151',
    flex: 1,
  },
  separator: {
    height: 8,
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  userBubble: {
    backgroundColor: '#e3f2fd',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: '#cce4ff',
  },
  assistantBubble: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderBottomLeftRadius: 4,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
  },
  time: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.5)',
    marginTop: 6,
    textAlign: 'right',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
  },
});
