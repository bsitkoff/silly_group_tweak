# Sprite Council - SillyTavern Extension

Acts as a "DM" (Dungeon Master) for sprite group chats, intelligently routing user messages to the most relevant characters.

## Features

### 🎯 Smart Sprite Routing
Routes user messages to sprites based on keyword domains. Each sprite has areas of expertise, and the extension matches user messages against these domains to select the most relevant respondents.

### 👥 Max Speakers Control
Limits how many sprites respond to each user message (default: 2). Prevents overwhelming conversations and keeps discussions focused.

### 📝 Brevity Enforcement
Automatically injects instructions to keep sprite responses concise (3-5 sentences by default), unless the user asks for more detail.

### 🪑 Chair Sprite (Default: Pip)
Always includes a designated "chair" sprite when:
- Keywords match their domain (plan, schedule, time, task, overwhelmed)
- No other sprite has a strong keyword match
- Acts as a grounding voice and default facilitator

## How It Works

1. **User sends a message** in a group chat
2. **Extension analyzes** the message against sprite domain keywords
3. **Selects top N sprites** (respecting max_speakers limit)
4. **Injects mentions** to trigger Natural Order selection in SillyTavern
5. **Adds brevity instructions** to keep responses concise

## Configuration

Default sprite domains (edit in `index.js`):

```javascript
sprite_domains: {
    "Pip": ["plan", "schedule", "time", "task", "overwhelmed", "organize", "manage"],
    "Saffron": ["food", "dinner", "meal", "hungry", "cooking", "recipe", "eat"],
    "Echo": ["feelings", "sad", "anxious", "emotion", "feel", "afraid", "worried"],
    "Knot": ["info", "research", "explain", "study", "learn", "understand", "how"],
    "Quorum": ["decide", "choice", "pick", "choose", "decision", "should"]
}
```

### Adjustable Settings

In `index.js`, modify the `spriteCouncilSettings` object:

- **enabled** (true/false): Turn extension on/off
- **max_speakers** (number): Maximum sprites per user message (default: 2)
- **brevity_enabled** (true/false): Enable/disable brevity enforcement
- **brevity_instruction** (string): Custom instruction for keeping responses short
- **chair_sprite** (string): Name of the default "chair" sprite (default: "Pip")
- **sprite_domains** (object): Keyword mappings for each sprite

## Installation

1. Copy this folder to your SillyTavern extensions directory:
   - `{SillyTavern}/data/{user}/extensions/sprite-council/`
   - Or: `{SillyTavern}/public/scripts/extensions/third-party/sprite-council/`

2. Restart SillyTavern or reload extensions

3. The extension will automatically activate for group chats

## Usage

### Basic Usage
Just chat normally in a group chat! The extension automatically:
- Selects relevant sprites based on your message
- Limits responses to your configured max_speakers
- Keeps responses brief

### Example Routing

**User:** "I'm feeling overwhelmed with all these tasks"
- **Selects:** Pip (overwhelmed + task keywords) + Echo (feelings keyword)

**User:** "What should we have for dinner?"
- **Selects:** Saffron (food + dinner keywords) + Quorum (should keyword)

**User:** "Can you explain how photosynthesis works?"
- **Selects:** Knot (explain + how keywords) + Pip (chair fallback)

**User:** "Just saying hi!"
- **Selects:** Pip (no strong matches, chair sprite always responds)

## Customization

### Adding New Sprites

Edit the `sprite_domains` object in `index.js`:

```javascript
sprite_domains: {
    "YourSpriteName": ["keyword1", "keyword2", "keyword3"],
    // ... existing sprites
}
```

### Changing Chair Sprite

Modify the `chair_sprite` setting:

```javascript
chair_sprite: "YourPreferredSprite"
```

### Adjusting Brevity Instructions

Customize the brevity message:

```javascript
brevity_instruction: "Keep your response under 4 sentences and be playful about it."
```

## Technical Details

### How Sprite Selection Works

1. **Keyword Matching**: Uses whole-word regex matching against message text
2. **Scoring**: Each keyword match = +1 point for that sprite
3. **Ranking**: Sprites sorted by score (highest first)
4. **Chair Priority**: Chair sprite included if they match keywords OR no other sprite scores points
5. **Selection**: Top N sprites selected (up to max_speakers)

### Integration with SillyTavern

- Uses the `generate_interceptor` hook to run before each generation
- Modifies the chat array to inject mentions
- Works with SillyTavern's Natural Order group chat strategy
- Adds system notes for brevity enforcement

## Troubleshooting

**Sprites not responding:**
- Make sure you're in a group chat
- Check that sprite names in config exactly match character names
- Verify the extension is enabled in settings

**Too many/few sprites responding:**
- Adjust `max_speakers` setting
- Check keyword matches in console log

**Responses too long:**
- Verify `brevity_enabled` is true
- Customize `brevity_instruction` to be more specific

**Chair sprite not working:**
- Ensure `chair_sprite` name matches exactly
- Check that character exists in the group

## Debug Mode

Check browser console (F12) for debug output:
- Selected sprites for each message
- Keyword match scores
- Interceptor execution logs

## Requirements

- SillyTavern staging version or stable >= 1.11.6
- Group chat with multiple characters
- Natural Order reply strategy recommended

## Future Enhancements

Potential features for future versions:
- Settings UI panel
- Per-character response length limits
- Conversation history awareness
- Dynamic domain learning
- Multi-turn conversation threading
- Priority weighting for keywords

## License

MIT License - Feel free to modify and share!

## Credits

Created for managing sprite councils and keeping group chat conversations focused and relevant.

*taps tiny pocket watch* ✨
