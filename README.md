# Sprite Council - SillyTavern Extension

Acts as a "DM" (Dungeon Master) for group chats, intelligently routing user messages to the most relevant characters based on keyword matching.

## Features

### 🎯 Smart Character Routing
Routes user messages to characters based on keyword domains. Keywords are **automatically extracted from character lorebooks** - no manual configuration needed! The extension matches user messages against these domains to select the most relevant respondents.

### 📚 Lorebook Integration
- **Auto-extracts keywords** from each character's lorebook entries
- **One-click refresh** to sync keywords when lorebooks change
- **Manual override** available if you want to customize keywords
- Works with character-specific lorebooks (character_book)

### 👥 Max Speakers Control
Limits how many characters respond to each user message (default: 2). Prevents overwhelming conversations and keeps discussions focused.

### 📝 Brevity Enforcement
Automatically injects instructions to keep character responses concise (3-5 sentences by default), unless the user asks for more detail.

### 🪑 Chair Character (Optional)
Optionally designate a "chair" or default character who:
- Responds when their keywords match
- Acts as fallback when no other character has strong keyword matches
- Provides a consistent grounding voice in conversations

### 🔄 Dynamic Group Detection
- **Add characters from dropdown** showing current group members
- **Chair selection from dropdown** of actual characters in the group
- **Auto-updates** when you switch groups or change membership

## How It Works

1. **User sends a message** in a group chat
2. **Extension analyzes** the message against character keyword domains
3. **Selects top N characters** (respecting max_speakers limit)
4. **Injects mentions** to trigger Natural Order selection in SillyTavern
5. **Adds brevity instructions** to keep responses concise

## Configuration

**All configuration is done through the SillyTavern Extensions settings panel!**

No hardcoded character names - you configure everything through the UI:

1. Open SillyTavern
2. Go to **Extensions** (puzzle piece icon)
3. Find **Sprite Council** in the extensions list
4. Click to expand the settings panel

### Available Settings

- **Enable Extension**: Turn the extension on/off
- **Max Speakers**: How many characters can respond per message (1-5, default: 2)
- **Chair Character**: Select a default/fallback character from your configured characters (optional)
- **Brevity Enforcement**: Toggle concise responses on/off
- **Brevity Instruction**: Customize the instruction for keeping responses brief
- **Character Domains**: Add/edit/delete characters and their keyword triggers
- **Import/Export**: Save and share your configuration as JSON

### Setting Up Your Characters

1. **Add a character**: Select from the dropdown of your current group members and click "Add Character"
   - Keywords are **automatically extracted from the character's lorebook** if available
   - If no lorebook entries exist, you can add keywords manually
2. **Refresh keywords**: Click the 🔄 button next to any character to re-sync keywords from their lorebook
   - Or use "🔄 Refresh All" to update all characters at once
3. **Edit keywords manually**: Type in the keyword field if you want to customize or add keywords beyond the lorebook
4. **Set chair character** (optional): The dropdown shows all characters in your current group chat. Characters with a ✓ have keywords configured. Select which character should be the default/fallback.
5. **Adjust settings**: Use the sliders and toggles to fine-tune behavior

**Note:** Both dropdowns automatically update when you switch group chats, so you can easily work with whoever is in your current group.

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

### Example Configuration & Routing

Let's say you configure these characters (example only - use your own character names):

- **Alice**: plan, schedule, time, task, overwhelmed
- **Bob**: food, dinner, meal, hungry, cooking
- **Carol**: feelings, sad, anxious, emotion, feel

With **Alice** as the chair character and **max_speakers: 2**:

**User:** "I'm feeling overwhelmed with all these tasks"
- **Selects:** Alice (overwhelmed + task) + Carol (feelings)

**User:** "What should we have for dinner?"
- **Selects:** Bob (food + dinner) + Alice (chair fallback)

**User:** "Just saying hi!"
- **Selects:** Alice (no matches, chair character responds)

## Customization

### Adding New Characters

Use the settings UI - no code editing required:

1. Select a character from the dropdown (shows current group members)
2. Click "Add Character"
3. Keywords are automatically extracted from the character's lorebook
4. Manually edit keywords if needed - changes save automatically after you stop typing

### Syncing Lorebook Changes

If you update a character's lorebook:
1. Click the 🔄 button next to that character to refresh their keywords
2. Or click "🔄 Refresh All" to update all configured characters at once

### Changing Chair Character

Use the "Chair Sprite" dropdown in settings to select from your configured characters, or leave it as "None" for purely score-based selection.

### Adjusting Brevity Instructions

Edit the "Brevity Instruction" textarea in settings. Changes save automatically.

### Import/Export Settings

- **Export**: Click "Export Settings" to save your configuration as JSON
- **Import**: Click "Import Settings" to load a previously saved configuration
- Share configurations with others or backup your settings!

## Technical Details

### How Character Selection Works

1. **Keyword Matching**: Uses whole-word regex matching against message text
2. **Scoring**: Each keyword match = +1 point for that character
3. **Ranking**: Characters sorted by score (highest first)
4. **Chair Priority**: Chair character included if they match keywords OR no other character scores points
5. **Selection**: Top N characters selected (up to max_speakers)

### Integration with SillyTavern

- Uses the `generate_interceptor` hook to run before each generation
- Modifies the chat array to inject mentions
- Works with SillyTavern's Natural Order group chat strategy
- Adds system notes for brevity enforcement

## Troubleshooting

**Characters not responding:**
- Make sure you're in a group chat
- Check that character names in extension settings exactly match your SillyTavern character names (case-sensitive!)
- Verify the extension is enabled in settings

**Too many/few characters responding:**
- Adjust `max_speakers` setting
- Check keyword matches in browser console log (F12)

**Responses too long:**
- Verify `brevity_enabled` is true
- Customize `brevity_instruction` to be more specific

**Chair character not working:**
- Ensure chair character name matches exactly
- Check that character exists in the group chat

## Debug Mode

Check browser console (F12) for debug output:
- Selected characters for each message
- Keyword match scores
- Interceptor execution logs
- Settings load/save confirmations

## Requirements

- SillyTavern staging version or stable >= 1.11.6
- Group chat with multiple characters
- Natural Order reply strategy recommended

## Future Enhancements

Potential features for future versions:
- Per-character response length limits
- Conversation history awareness (don't re-select same character multiple times in a row)
- Dynamic domain learning based on character responses
- Multi-turn conversation threading
- Priority/weight system for keywords (some keywords more important than others)
- Auto-detect character names from current group

## License

MIT License - Feel free to modify and share!

## Credits

Originally created for managing sprite councils, but works with any group chat characters!

Perfect for:
- Multi-character roleplay
- Virtual assistant teams
- Story writing collaborations
- Expert panels
- Any scenario where you want smart character selection instead of chaos

*taps tiny pocket watch* ✨
