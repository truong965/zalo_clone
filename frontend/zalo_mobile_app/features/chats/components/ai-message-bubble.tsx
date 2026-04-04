import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { Text } from 'react-native-paper';

/**
 * Parse AI response and format with markdown-like support
 * Supports: **bold**, numbered lists, bullet points, line breaks, blockquotes
 */
export function parseAiResponse(content: string): React.ReactNode {
  if (!content) return null;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed && elements.length > 0 && idx < lines.length - 1) {
      elements.push(<View key={`sep-${idx}`} style={styles.separator} />);
      return;
    }

    // Check for blockquote: > text
    const blockquoteMatch = trimmed.match(/^>\s*(.+)/);
    if (blockquoteMatch) {
      elements.push(
        <View key={`bq-${idx}`} style={styles.blockquote}>
          <Text style={styles.blockquoteText}>{formatInlineText(blockquoteMatch[1])}</Text>
        </View>
      );
      return;
    }

    // Check for lists
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    const bulletMatch = trimmed.match(/^[\-•]\s+(.+)/);

    if (numberedMatch) {
      elements.push(
        <View key={`li-${idx}`} style={styles.listItem}>
          <Text style={styles.listNumber}>{numberedMatch[1]}.</Text>
          <View style={{ flex: 1 }}>{formatInlineText(numberedMatch[2])}</View>
        </View>
      );
    } else if (bulletMatch) {
      elements.push(
        <View key={`li-${idx}`} style={styles.listItem}>
          <Text style={styles.bullet}>•</Text>
          <View style={{ flex: 1 }}>{formatInlineText(bulletMatch[1])}</View>
        </View>
      );
    } else if (trimmed.length > 0) {
      elements.push(
        <View key={`p-${idx}`} style={styles.paragraphContainer}>
          {formatInlineText(trimmed)}
        </View>
      );
    }
  });

  return (
    <View style={styles.container}>
      {elements.length > 0 ? elements : <Text style={styles.paragraph}>{content}</Text>}
    </View>
  );
}

/**
 * Format inline text: **bold**, `code`
 */
function formatInlineText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  
  return (
    <Text style={styles.paragraph}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={i} style={styles.code}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
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
  thought,
  isUser,
  isLoading,
  time,
  error,
}: {
  content?: string;
  thought?: string;
  isUser: boolean;
  isLoading?: boolean;
  time?: string;
  error?: { message: string };
}) {
  return (
    <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
      {!isUser && thought && (
        <View style={styles.thoughtSection}>
          <Text style={styles.thoughtHeader}>SUY NGHĨ CỦA AI</Text>
          <View style={styles.thoughtContent}>
            {parseAiResponse(thought)}
          </View>
        </View>
      )}
      
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
  },
  paragraphContainer: {
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
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
  },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: '#e5e7eb',
    paddingLeft: 12,
    paddingVertical: 4,
    marginVertical: 4,
    backgroundColor: '#f9fafb',
    borderRadius: 2,
  },
  blockquoteText: {
    fontStyle: 'italic',
    color: '#4b5563',
    fontSize: 13,
  },
  listItem: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingRight: 10,
  },
  listNumber: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1f2937',
    width: 24,
  },
  bullet: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1f2937',
    width: 24,
    textAlign: 'center',
  },
  thoughtSection: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#fff7ed',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  thoughtHeader: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ea580c',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  thoughtContent: {
    opacity: 0.9,
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
