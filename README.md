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

### 🪑 Chair Mode (NEW!)
Two modes of operation:

**Chair Mode**: Turn-based conversation control where:
- Only the chair character responds to user messages
- Chair can explicitly call on other characters (e.g., "I call on Willow")
- Called character responds, then control returns to chair
- Perfect for structured meetings, facilitated discussions, or therapy-style sessions

**Keyword Mode** (original behavior): Keyword-based routing where:
- Characters are selected based on keyword matches in user messages
- Chair character acts as fallback when no other matches
- Multiple characters can respond per message (up to max_speakers)

### 🔄 Dynamic Group Detection
- **Add characters from dropdown** showing current group members
- **Chair selection from dropdown** of actual characters in the group
- **Auto-updates** when you switch groups or change membership

## How It Works

### Chair Mode

1. **User sends a message** in a group chat
2. **Only the chair character responds** automatically
3. **Chair calls on other characters** by name in their message (e.g., "I call on Willow", "Willow, your turn")
4. **Extension detects the call-on** and allows only that character to respond next
5. **Control returns to chair** after the called character responds
6. **Brevity instructions** keep all responses concise

### Keyword Mode (Original)

1. **User sends a message** in a group chat
2. **Extension analyzes** the message against character keyword domains
3. **Selects top N characters** (respecting max_speakers limit)
4. **Injects instructions** to limit speakers
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
- **Enable Chair Mode**: Switch between Chair Mode (turn-based control) and Keyword Mode (keyword-based routing)
- **Chair Character**: Select the character who will control the conversation
  - In Chair Mode: This character responds to user messages and calls on others
  - In Keyword Mode: Acts as fallback when no keywords match
- **Max Speakers**: How many characters can respond per message (Keyword Mode only, 1-5, default: 2)
- **Brevity Enforcement**: Toggle concise responses on/off
- **Brevity Instruction**: Customize the instruction for keeping responses brief
- **Character Domains**: Add/edit/delete characters and their keyword triggers (Keyword Mode only)
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

### Using Chair Mode

Perfect for structured conversations where one character facilitates:

1. **Enable Chair Mode** in extension settings
2. **Select a chair character** from the dropdown
3. **User messages** → Only the chair responds
4. **Chair calls on others** using phrases like:
   - "I call on Willow"
   - "Willow, your turn"
   - "Let's hear from Sparks"
   - "Sparks, what do you think?"
5. **Called character responds** → Only they can speak
6. **Control returns to chair** automatically after they respond

**Example conversation:**
```
User: "Hello all. We are testing a new extension."
Pip (chair): "Hey! I'll be chairing this session. Willow, can you share your thoughts?"
Willow: "This is working well! The turn-taking feels natural."
Pip (chair): "Thanks Willow. User, what would you like to discuss next?"
```

### Using Keyword Mode (Original Behavior)

For more organic, keyword-driven conversations:

1. **Disable Chair Mode** in extension settings
2. **Configure character keywords** (auto-extracted from lorebooks)
3. Just chat normally! The extension automatically:
   - Selects relevant characters based on keywords in your message
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
