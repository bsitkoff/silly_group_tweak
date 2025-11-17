/**
 * Sprite Council Extension for SillyTavern
 * Acts as a DM for sprite group chats - routes messages to relevant sprites,
 * limits speakers, and enforces brevity.
 */

(function() {
    'use strict';

    // Extension version
    const EXTENSION_VERSION = '1.2.0';

    // Extension settings with defaults (no hardcoded sprites)
    const defaultSettings = {
        enabled: true,
        chair_mode: false,  // NEW: Enable chair-controlled turn-taking
        max_speakers: 2,
        brevity_enabled: true,
        brevity_instruction: "Reply in 3-5 sentences max unless the user specifically asks for more detail.",
        chair_sprite: "",
        sprite_domains: {},
        saved_activation_strategy: null  // Store original mode when Chair Mode is enabled
    };

    let spriteCouncilSettings = { ...defaultSettings };

    // Keep track of the last user message content for routing
    let lastUserMessage = "";
    let isProcessingGroup = false;

    // Track when we're forcing a generation in Chair Mode (so we don't abort our own generations)
    let isChairModeForcing = false;

    // Group chat activation strategies (SillyTavern constants)
    const ACTIVATION_STRATEGY = {
        NATURAL: 0,
        LIST: 1,
        MANUAL: 2  // Manual mode - no auto-selection
    };

    /**
     * Score a sprite based on keyword matches in the message
     */
    function scoreSprite(spriteName, messageText) {
        const domains = spriteCouncilSettings.sprite_domains[spriteName] || [];
        const lowerMessage = messageText.toLowerCase();
        let score = 0;

        for (const keyword of domains) {
            // Use word boundary regex for whole word matching
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(lowerMessage)) {
                score++;
            }
        }

        return score;
    }

    /**
     * Detect if the chair is calling on a specific sprite in their message
     * Returns the sprite name if found, null otherwise
     * Simple rule: if the chair mentions any sprite name (except themselves), that sprite gets freed to speak
     */
    function detectCalledSprite(chairMessage, groupMembers, chairSprite) {
        if (!chairMessage) return null;

        const lowerMessage = chairMessage.toLowerCase();

        // Check each sprite name - if the chair mentions them, they're called
        for (const member of groupMembers) {
            // Skip if this is the chair themselves
            if (member === chairSprite) continue;

            const lowerName = member.toLowerCase();

            // Simple rule: if the chair's message contains any other sprite's name, call on them
            if (lowerMessage.includes(lowerName)) {
                console.log(`[Sprite Council] Chair mentioned ${member}, freeing them to speak`);
                return member;
            }
        }

        return null;
    }

    /**
     * Detect if the user mentioned a specific sprite in their message
     * Returns the sprite name if found, null otherwise
     * Simple rule: if the user mentions any sprite name, that sprite gets to respond
     */
    function detectUserMentionedSprite(userMessage, groupMembers) {
        if (!userMessage) return null;

        const lowerMessage = userMessage.toLowerCase();

        // Check each sprite name - if the user mentions them, they get to respond
        for (const member of groupMembers) {
            const lowerName = member.toLowerCase();

            // Simple rule: if the user's message contains any sprite's name, call on them
            if (lowerMessage.includes(lowerName)) {
                console.log(`[Sprite Council] User mentioned ${member}, letting them respond directly`);
                return member;
            }
        }

        return null;
    }

    /**
     * Select which sprites should respond to the message (keyword-based mode)
     * This is used when chair mode is disabled
     */
    function selectSprites(messageText, groupMembers) {
        const chairSprite = spriteCouncilSettings.chair_sprite;
        const maxSpeakers = spriteCouncilSettings.max_speakers;

        // Score all sprites
        const scored = groupMembers.map(member => ({
            name: member,
            score: scoreSprite(member, messageText)
        }));

        // Sort by score (highest first)
        scored.sort((a, b) => b.score - a.score);

        // Check if chair sprite should be included
        const chairScore = scored.find(s => s.name === chairSprite)?.score || 0;
        const hasChairKeywords = chairScore > 0;
        const noStrongMatches = scored[0]?.score === 0;
        const includeChair = hasChairKeywords || noStrongMatches;

        let selected = [];

        // Always include chair sprite if conditions met
        if (includeChair && chairSprite) {
            selected.push(chairSprite);
        }

        // Add top-scoring sprites up to max_speakers
        for (const sprite of scored) {
            if (selected.length >= maxSpeakers) break;
            if (!selected.includes(sprite.name)) {
                selected.push(sprite.name);
            }
        }

        // If we still have room and didn't include chair, add highest scorer
        if (selected.length === 0 && scored.length > 0) {
            selected.push(scored[0].name);
        }

        console.log(`[Sprite Council] Selected sprites for message: ${selected.join(', ')}`);
        return selected;
    }

    /**
     * Get group member names from context
     */
    function getGroupMemberNames() {
        try {
            const context = SillyTavern.getContext();
            if (!context.groupId) {
                console.log('[Sprite Council] getGroupMemberNames: No groupId in context');
                return null; // Not in a group chat
            }

            console.log('[Sprite Council] getGroupMemberNames: groupId =', context.groupId);
            console.log('[Sprite Council] getGroupMemberNames: context.groups =', context.groups);

            const group = context.groups.find(g => g.id === context.groupId);
            if (!group) {
                console.log('[Sprite Council] getGroupMemberNames: No matching group found');
                return null;
            }

            console.log('[Sprite Council] getGroupMemberNames: group.members =', group.members);
            console.log('[Sprite Council] getGroupMemberNames: context.characters length =', context.characters?.length);

            // group.members can be either avatar filenames OR numeric character IDs depending on SillyTavern version
            // We need to handle both cases
            const names = group.members
                .map(memberId => {
                    // Try numeric index first (for newer ST versions)
                    let char = context.characters[memberId];

                    // If that fails, try finding by avatar filename (for older ST versions)
                    if (!char && typeof memberId === 'string') {
                        char = context.characters.find(c => c.avatar === memberId);
                    }

                    console.log(`[Sprite Council] getGroupMemberNames: memberId ${memberId} -> char:`, char?.name || 'undefined');
                    return char;
                })
                .filter(Boolean)
                .map(char => char.name);

            console.log('[Sprite Council] getGroupMemberNames: Final names =', names);
            return names;
        } catch (error) {
            console.error('[Sprite Council] Error getting group members:', error);
            return null;
        }
    }

    /**
     * Get the character ID for a character name in the current group
     */
    function getCharacterIdByName(characterName) {
        try {
            const context = SillyTavern.getContext();
            // Find character by name - the index in characters array is the chid
            const idx = context.characters.findIndex(c => c.name === characterName);
            return idx === -1 ? null : idx;
        } catch (error) {
            console.error('[Sprite Council] Error getting character ID:', error);
            return null;
        }
    }

    /**
     * Force a character to reply by clicking their Force Talk button
     * This is the programmatic equivalent of clicking the speech bubble icon in the UI
     */
    function forceCharacterReply(chid) {
        try {
            const button = document.querySelector(`.group-force-talk[data-chid="${chid}"]`);
            if (button) {
                button.click(); // fires the same logic as the UI "💬" button
                console.log('[Sprite Council] Clicked Force Talk button for chid:', chid);
                return true;
            }
            console.warn('[Sprite Council] Could not find Force Talk button for chid', chid);
            return false;
        } catch (error) {
            console.error('[Sprite Council] Error forcing character reply:', error);
            return false;
        }
    }

    /**
     * Determine which character should speak next in Chair Mode
     */
    function getNextChairModeSpeaker(chat, groupMembers, chairSprite) {
        // Find the last non-system message
        let lastMessage = null;
        for (let i = chat.length - 1; i >= 0; i--) {
            if (chat[i].mes && !chat[i].is_system) {
                lastMessage = chat[i];
                break;
            }
        }

        if (!lastMessage) {
            // No messages yet, default to chair
            return chairSprite;
        } else if (lastMessage.is_user) {
            // User just spoke → check if they mentioned a specific sprite
            const mentionedSprite = detectUserMentionedSprite(lastMessage.mes, groupMembers);
            if (mentionedSprite) {
                console.log(`[Sprite Council] User mentioned ${mentionedSprite}, letting them respond`);
                return mentionedSprite;
            }
            // No specific sprite mentioned → chair responds as normal
            return chairSprite;
        } else {
            // Last message from a character
            const lastSpeaker = lastMessage.name;

            if (lastSpeaker === chairSprite) {
                // Chair just spoke → check if they called on someone
                const calledSprite = detectCalledSprite(lastMessage.mes, groupMembers, chairSprite);
                if (calledSprite) {
                    console.log(`[Sprite Council] Chair called on ${calledSprite}`);
                    return calledSprite;
                } else {
                    // Chair spoke but didn't call anyone → chair continues
                    return chairSprite;
                }
            } else {
                // Someone other than chair spoke → yield back to chair
                console.log(`[Sprite Council] ${lastSpeaker} spoke → yielding back to chair`);
                return chairSprite;
            }
        }
    }

    /**
     * Generation interceptor - runs before each generation
     * This is where we inject our routing logic and brevity instructions
     */
    window.interceptGeneration = function(chat, contextSize, abort, type) {
        if (!spriteCouncilSettings.enabled) {
            return; // Extension disabled
        }

        try {
            const groupMembers = getGroupMemberNames();

            // Only intercept group chats
            if (!groupMembers || groupMembers.length === 0) {
                return;
            }

            const chairSprite = spriteCouncilSettings.chair_sprite;
            let selectedSprites = [];

            // CHAIR MODE: Manual control with forced generation
            if (spriteCouncilSettings.chair_mode && chairSprite) {
                console.log('[Sprite Council] Chair mode active, chair:', chairSprite);

                // In Chair Mode, we use /trigger to force the correct character to generate
                // We don't add system messages because they can cause characters to roleplay as each other
                // The actual character forcing happens in the event listeners (message_sent, generation_ended)
                console.log('[Sprite Council] Chair mode: using /trigger for character control, not adding system messages');
            }
            // KEYWORD MODE: Original behavior - select based on keywords
            else {
                // Find the last user message
                let lastUserMsg = null;
                for (let i = chat.length - 1; i >= 0; i--) {
                    if (chat[i].is_user) {
                        lastUserMsg = chat[i];
                        break;
                    }
                }

                if (!lastUserMsg) {
                    return; // No user message found
                }

                const messageContent = lastUserMsg.mes || "";
                selectedSprites = selectSprites(messageContent, groupMembers);
                console.log('[Sprite Council] Keyword mode: selected', selectedSprites.join(', '));

                // Inject speaker restriction by adding a system message
                // This tells Natural Order who should speak (only in Keyword Mode)
                if (selectedSprites.length > 0) {
                    // Remove any previous sprite-council-instruction messages
                    for (let i = chat.length - 1; i >= 0; i--) {
                        if (chat[i].is_system && chat[i].mes && chat[i].mes.includes('<!-- sprite-council-instruction -->')) {
                            chat.splice(i, 1);
                        }
                    }

                    // Add instruction for who should speak
                    const speakerList = selectedSprites.join(', ');
                    const instructionMessage = {
                        name: 'System',
                        is_system: true,
                        is_user: false,
                        mes: `<!-- sprite-council-instruction -->\nONLY the following character(s) should respond to this message: ${speakerList}. All other characters must remain silent and not respond.`
                    };
                    chat.push(instructionMessage);
                    console.log(`[Sprite Council] Restricted speakers to: ${speakerList}`);
                }
            }

            // Inject brevity instruction
            if (spriteCouncilSettings.brevity_enabled) {
                const hasBrevityNote = chat.some(msg =>
                    msg.is_system && msg.mes === spriteCouncilSettings.brevity_instruction
                );

                if (!hasBrevityNote) {
                    chat.push({
                        name: 'System',
                        is_system: true,
                        is_user: false,
                        mes: spriteCouncilSettings.brevity_instruction
                    });
                }
            }

        } catch (error) {
            console.error('[Sprite Council] Error in interceptor:', error);
        }
    };

    /**
     * Save settings to extension storage
     */
    function saveSettings() {
        const context = SillyTavern.getContext();
        if (!context.extensionSettings) {
            context.extensionSettings = {};
        }
        context.extensionSettings.sprite_council = spriteCouncilSettings;
        context.saveSettingsDebounced();
        console.log('[Sprite Council] Settings saved:', spriteCouncilSettings);
    }

    /**
     * Load settings from extension storage
     */
    function loadSettings() {
        const context = SillyTavern.getContext();
        if (context.extensionSettings && context.extensionSettings.sprite_council) {
            spriteCouncilSettings = {
                ...defaultSettings,
                ...context.extensionSettings.sprite_council
            };
        }
        console.log('[Sprite Council] Settings loaded:', spriteCouncilSettings);
    }

    /**
     * Update the "add character" dropdown with available group members
     */
    function updateAddCharacterDropdown() {
        const dropdown = $('#sprite-council-new-sprite-select');
        dropdown.empty();
        dropdown.append('<option value="">Select a character to add...</option>');

        const groupMembers = getGroupMemberNames();
        if (groupMembers && groupMembers.length > 0) {
            for (const memberName of groupMembers) {
                const isConfigured = spriteCouncilSettings.sprite_domains[memberName] !== undefined;
                if (!isConfigured) {
                    dropdown.append(`<option value="${memberName}">${memberName}</option>`);
                }
            }

            // Add a separator and show configured characters
            const configured = groupMembers.filter(name =>
                spriteCouncilSettings.sprite_domains[name] !== undefined
            );
            if (configured.length > 0) {
                dropdown.append('<option disabled>──────────</option>');
                dropdown.append('<option disabled>Already configured:</option>');
                configured.forEach(name => {
                    dropdown.append(`<option disabled>  ${name} ✓</option>`);
                });
            }
        } else {
            dropdown.append('<option disabled>No group chat active</option>');
        }
    }

    /**
     * Render the sprite domains UI
     */
    function renderSpriteDomainsUI() {
        const container = $('#sprite-council-domains-list');
        container.empty();

        const sprites = Object.keys(spriteCouncilSettings.sprite_domains);

        if (sprites.length === 0) {
            container.append('<div class="sprite-domain-empty">No characters configured yet. Select one below.</div>');
            updateAddCharacterDropdown();
            return;
        }

        for (const spriteName of sprites) {
            const keywords = spriteCouncilSettings.sprite_domains[spriteName] || [];
            const keywordText = keywords.join(', ');
            const keywordCount = keywords.length;

            const spriteHtml = `
                <div class="sprite-domain-item" data-sprite="${spriteName}">
                    <div class="sprite-domain-header">
                        <strong>${spriteName}</strong>
                        <span class="sprite-keyword-count">${keywordCount} keywords</span>
                        <button class="sprite-domain-refresh menu_button" data-sprite="${spriteName}" title="Refresh keywords from lorebook">🔄</button>
                        <button class="sprite-domain-delete menu_button" data-sprite="${spriteName}">Delete</button>
                    </div>
                    <div class="sprite-domain-keywords">
                        <input type="text" class="text_pole sprite-domain-keywords-input"
                               data-sprite="${spriteName}"
                               value="${keywordText}"
                               placeholder="Enter keywords separated by commas (or refresh from lorebook)">
                    </div>
                </div>
            `;
            container.append(spriteHtml);
        }

        // Update dropdowns
        updateChairSpriteDropdown();
        updateAddCharacterDropdown();
    }

    /**
     * Update the chair sprite dropdown with actual group members
     */
    function updateChairSpriteDropdown() {
        const dropdown = $('#sprite-council-chair-sprite');
        const currentChair = spriteCouncilSettings.chair_sprite;

        dropdown.empty();
        dropdown.append('<option value="">None (random selection)</option>');

        // Try to get actual group members from context
        const groupMembers = getGroupMemberNames();

        if (groupMembers && groupMembers.length > 0) {
            // We have a group - show actual members
            for (const memberName of groupMembers) {
                const hasDomain = spriteCouncilSettings.sprite_domains[memberName] !== undefined;
                const label = hasDomain ? `${memberName} ✓` : memberName;
                const selected = memberName === currentChair ? 'selected' : '';
                dropdown.append(`<option value="${memberName}" ${selected}>${label}</option>`);
            }
        } else {
            // No group detected - fall back to configured sprites
            const sprites = Object.keys(spriteCouncilSettings.sprite_domains);
            if (sprites.length > 0) {
                dropdown.append('<option disabled>──────────</option>');
                dropdown.append('<option disabled>No group chat active</option>');
                dropdown.append('<option disabled>Showing configured characters:</option>');
                dropdown.append('<option disabled>──────────</option>');
                for (const spriteName of sprites) {
                    const selected = spriteName === currentChair ? 'selected' : '';
                    dropdown.append(`<option value="${spriteName}" ${selected}>${spriteName}</option>`);
                }
            } else {
                dropdown.append('<option disabled>──────────</option>');
                dropdown.append('<option disabled>Open a group chat or add characters</option>');
            }
        }
    }

    /**
     * Add a new sprite
     */
    function addSprite() {
        const dropdown = $('#sprite-council-new-sprite-select');
        const spriteName = dropdown.val();

        if (!spriteName) {
            toastr.warning('Please select a character');
            return;
        }

        if (spriteCouncilSettings.sprite_domains[spriteName]) {
            toastr.warning('This character is already configured');
            return;
        }

        // Try to auto-populate keywords from lorebook
        const keywords = extractKeywordsFromLorebook(spriteName);

        spriteCouncilSettings.sprite_domains[spriteName] = keywords;
        dropdown.val('');
        saveSettings();
        renderSpriteDomainsUI();

        const keywordInfo = keywords.length > 0
            ? ` with ${keywords.length} keywords from lorebook`
            : ' (no lorebook keywords found - add manually)';
        toastr.success(`Added ${spriteName}${keywordInfo}`);
    }

    /**
     * Extract keywords from a character's lorebook
     */
    function extractKeywordsFromLorebook(characterName) {
        try {
            const context = SillyTavern.getContext();

            // Find the character
            const character = context.characters.find(c => c.name === characterName);
            if (!character) {
                console.log(`[Sprite Council] Character ${characterName} not found`);
                return [];
            }

            const keywords = new Set();

            // Check character lorebook (character_book)
            if (character.data && character.data.character_book) {
                const book = character.data.character_book;
                if (book.entries) {
                    for (const entry of book.entries) {
                        // Extract from keys (most common place for keywords)
                        if (entry.keys && Array.isArray(entry.keys)) {
                            entry.keys.forEach(key => {
                                const cleaned = key.trim().toLowerCase();
                                if (cleaned) keywords.add(cleaned);
                            });
                        }

                        // Also try secondary_keys if they exist
                        if (entry.secondary_keys && Array.isArray(entry.secondary_keys)) {
                            entry.secondary_keys.forEach(key => {
                                const cleaned = key.trim().toLowerCase();
                                if (cleaned) keywords.add(cleaned);
                            });
                        }
                    }
                }
            }

            const result = Array.from(keywords);
            console.log(`[Sprite Council] Extracted ${result.length} keywords for ${characterName}:`, result);
            return result;
        } catch (error) {
            console.error('[Sprite Council] Error extracting lorebook keywords:', error);
            return [];
        }
    }

    /**
     * Delete a sprite
     */
    function deleteSprite(spriteName) {
        if (confirm(`Delete sprite "${spriteName}" and all its keywords?`)) {
            delete spriteCouncilSettings.sprite_domains[spriteName];

            // Clear chair sprite if it was deleted
            if (spriteCouncilSettings.chair_sprite === spriteName) {
                spriteCouncilSettings.chair_sprite = "";
            }

            saveSettings();
            renderSpriteDomainsUI();
            toastr.success(`Deleted sprite: ${spriteName}`);
        }
    }

    /**
     * Update sprite keywords
     */
    function updateSpriteKeywords(spriteName, keywordsText) {
        const keywords = keywordsText
            .split(',')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);

        spriteCouncilSettings.sprite_domains[spriteName] = keywords;
        saveSettings();
    }

    /**
     * Refresh a single character's keywords from their lorebook
     */
    function refreshCharacterKeywords(spriteName) {
        const keywords = extractKeywordsFromLorebook(spriteName);

        if (keywords.length > 0) {
            spriteCouncilSettings.sprite_domains[spriteName] = keywords;
            saveSettings();
            renderSpriteDomainsUI();
            toastr.success(`Refreshed ${spriteName}: ${keywords.length} keywords from lorebook`);
        } else {
            toastr.warning(`No lorebook keywords found for ${spriteName}`);
        }
    }

    /**
     * Refresh all configured characters' keywords from lorebooks
     */
    function refreshAllKeywords() {
        const sprites = Object.keys(spriteCouncilSettings.sprite_domains);

        if (sprites.length === 0) {
            toastr.info('No characters configured yet');
            return;
        }

        let updated = 0;
        let totalKeywords = 0;

        for (const spriteName of sprites) {
            const keywords = extractKeywordsFromLorebook(spriteName);
            if (keywords.length > 0) {
                spriteCouncilSettings.sprite_domains[spriteName] = keywords;
                updated++;
                totalKeywords += keywords.length;
            }
        }

        saveSettings();
        renderSpriteDomainsUI();

        if (updated > 0) {
            toastr.success(`Refreshed ${updated} character(s): ${totalKeywords} total keywords from lorebooks`);
        } else {
            toastr.warning('No lorebook keywords found for any configured characters');
        }
    }

    /**
     * Create and append the settings UI HTML
     */
    function createSettingsUI() {
        const settingsHtml = `
            <div id="sprite-council-settings">
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>Sprite Council</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">

                        <!-- Enable/Disable -->
                        <div class="sprite-council-setting">
                            <label for="sprite-council-enabled">
                                <input type="checkbox" id="sprite-council-enabled" />
                                Enable Extension
                            </label>
                            <small>Turn the Sprite Council on or off</small>
                        </div>

                        <!-- Chair Mode -->
                        <div class="sprite-council-setting">
                            <label for="sprite-council-chair-mode">
                                <input type="checkbox" id="sprite-council-chair-mode" />
                                Enable Chair Mode
                            </label>
                            <small>When enabled, only the chair responds to user messages, and can call on other sprites to speak. When disabled, uses keyword-based routing.</small>
                        </div>

                        <!-- Chair Sprite -->
                        <div class="sprite-council-setting">
                            <label for="sprite-council-chair-sprite">Chair Character</label>
                            <select id="sprite-council-chair-sprite" class="text_pole">
                                <option value="">None</option>
                            </select>
                            <small>In Chair Mode: this character controls the conversation and calls on others. In Keyword Mode: fallback character when no keywords match.</small>
                        </div>

                        <!-- Max Speakers -->
                        <div class="sprite-council-setting">
                            <label for="sprite-council-max-speakers">
                                Max Speakers per Message: <span id="sprite-council-max-speakers-value">2</span>
                            </label>
                            <input type="range" id="sprite-council-max-speakers"
                                   min="1" max="5" step="1" value="2" class="slider">
                            <small>Maximum number of sprites that can respond to each user message (Keyword Mode only)</small>
                        </div>

                        <!-- Brevity Settings -->
                        <div class="sprite-council-setting">
                            <label for="sprite-council-brevity-enabled">
                                <input type="checkbox" id="sprite-council-brevity-enabled" />
                                Enforce Brevity
                            </label>
                            <small>Add instructions to keep responses concise</small>
                        </div>

                        <div class="sprite-council-setting">
                            <label for="sprite-council-brevity-instruction">Brevity Instruction</label>
                            <textarea id="sprite-council-brevity-instruction"
                                      class="text_pole"
                                      rows="2"
                                      placeholder="Instructions for keeping responses brief"></textarea>
                            <small>This instruction is added to the context during generation</small>
                        </div>

                        <!-- Sprite Domains Configuration -->
                        <div class="sprite-council-setting">
                            <h3>Sprite Domains</h3>
                            <small>Configure which sprites respond to which keywords</small>

                            <div id="sprite-council-domains-list" class="sprite-domains-container">
                                <!-- Dynamically populated -->
                            </div>

                            <div class="sprite-domain-add">
                                <select id="sprite-council-new-sprite-select" class="text_pole">
                                    <option value="">Select a character to add...</option>
                                </select>
                                <button id="sprite-council-add-sprite" class="menu_button">
                                    Add Character
                                </button>
                                <button id="sprite-council-refresh-lorebook" class="menu_button" title="Refresh keywords from lorebook for all configured characters">
                                    🔄 Refresh All
                                </button>
                            </div>
                        </div>

                        <!-- Export/Import Settings -->
                        <div class="sprite-council-setting">
                            <h3>Import/Export</h3>
                            <button id="sprite-council-export" class="menu_button">
                                Export Settings
                            </button>
                            <button id="sprite-council-import" class="menu_button">
                                Import Settings
                            </button>
                            <input type="file" id="sprite-council-import-file"
                                   accept=".json" style="display: none">
                        </div>

                    </div>
                </div>
            </div>
        `;

        $('#extensions_settings2').append(settingsHtml);
    }

    /**
     * Toggle group activation strategy when Chair Mode is enabled/disabled
     * When enabling Chair Mode: save current strategy and switch to MANUAL
     * When disabling: restore the saved strategy
     */
    function toggleChairModeActivationStrategy(enableChairMode) {
        try {
            const context = SillyTavern.getContext();
            if (!context.groupId) {
                console.log('[Sprite Council] Not in a group chat, cannot change activation strategy');
                return;
            }

            const group = context.groups.find(g => g.id === context.groupId);
            if (!group) {
                console.error('[Sprite Council] Current group not found');
                return;
            }

            if (enableChairMode) {
                // Save current activation strategy before switching to manual
                if (typeof group.activation_strategy !== 'undefined') {
                    spriteCouncilSettings.saved_activation_strategy = group.activation_strategy;
                    console.log('[Sprite Council] Saved activation strategy:', group.activation_strategy);
                }

                // Switch to MANUAL mode (value 2)
                group.activation_strategy = ACTIVATION_STRATEGY.MANUAL;
                console.log('[Sprite Council] Switched to MANUAL activation mode for Chair Mode');

                // Save the group settings
                if (context.saveGroupsDebounced && typeof context.saveGroupsDebounced === 'function') {
                    context.saveGroupsDebounced();
                }

                toastr.info('Group switched to Manual Mode for Chair Mode control');
            } else {
                // Restore previous activation strategy
                if (spriteCouncilSettings.saved_activation_strategy !== null) {
                    group.activation_strategy = spriteCouncilSettings.saved_activation_strategy;
                    console.log('[Sprite Council] Restored activation strategy:', group.activation_strategy);

                    // Clear the saved strategy
                    spriteCouncilSettings.saved_activation_strategy = null;

                    // Save the group settings
                    if (context.saveGroupsDebounced && typeof context.saveGroupsDebounced === 'function') {
                        context.saveGroupsDebounced();
                    }

                    const modeNames = ['Natural Order', 'Character List', 'Manual'];
                    const modeName = modeNames[group.activation_strategy] || 'Unknown';
                    toastr.info(`Group activation restored to: ${modeName}`);
                } else {
                    console.log('[Sprite Council] No saved activation strategy to restore');
                }
            }
        } catch (error) {
            console.error('[Sprite Council] Error toggling activation strategy:', error);
        }
    }

    /**
     * Bind UI event listeners
     */
    function bindUIEvents() {
        // Enable/Disable
        $('#sprite-council-enabled').on('change', function() {
            spriteCouncilSettings.enabled = $(this).prop('checked');
            saveSettings();
        });

        // Chair Mode
        $('#sprite-council-chair-mode').on('change', function() {
            const isEnabled = $(this).prop('checked');
            spriteCouncilSettings.chair_mode = isEnabled;

            // When enabling Chair Mode, switch group to Manual activation
            // When disabling, restore the previous activation strategy
            toggleChairModeActivationStrategy(isEnabled);

            saveSettings();
        });

        // Max Speakers
        $('#sprite-council-max-speakers').on('input', function() {
            const value = parseInt($(this).val());
            spriteCouncilSettings.max_speakers = value;
            $('#sprite-council-max-speakers-value').text(value);
            saveSettings();
        });

        // Chair Sprite
        $('#sprite-council-chair-sprite').on('change', function() {
            spriteCouncilSettings.chair_sprite = $(this).val();
            saveSettings();
        });

        // Brevity Enabled
        $('#sprite-council-brevity-enabled').on('change', function() {
            spriteCouncilSettings.brevity_enabled = $(this).prop('checked');
            saveSettings();
        });

        // Brevity Instruction
        $('#sprite-council-brevity-instruction').on('input', function() {
            spriteCouncilSettings.brevity_instruction = $(this).val();
            saveSettings();
        });

        // Add Sprite
        $('#sprite-council-add-sprite').on('click', addSprite);

        // Refresh single character's keywords from lorebook
        $(document).on('click', '.sprite-domain-refresh', function() {
            const spriteName = $(this).data('sprite');
            refreshCharacterKeywords(spriteName);
        });

        // Refresh all characters' keywords from lorebook
        $('#sprite-council-refresh-lorebook').on('click', function() {
            refreshAllKeywords();
        });

        // Delete Sprite (delegated event)
        $(document).on('click', '.sprite-domain-delete', function() {
            const spriteName = $(this).data('sprite');
            deleteSprite(spriteName);
        });

        // Update Keywords (delegated event with debounce)
        let keywordTimeout;
        $(document).on('input', '.sprite-domain-keywords-input', function() {
            const spriteName = $(this).data('sprite');
            const keywords = $(this).val();

            clearTimeout(keywordTimeout);
            keywordTimeout = setTimeout(() => {
                updateSpriteKeywords(spriteName, keywords);
            }, 500);
        });

        // Export Settings
        $('#sprite-council-export').on('click', function() {
            const dataStr = JSON.stringify(spriteCouncilSettings, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'sprite-council-settings.json';
            link.click();
            URL.revokeObjectURL(url);
            toastr.success('Settings exported');
        });

        // Import Settings
        $('#sprite-council-import').on('click', function() {
            $('#sprite-council-import-file').click();
        });

        $('#sprite-council-import-file').on('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const imported = JSON.parse(event.target.result);
                    spriteCouncilSettings = {
                        ...defaultSettings,
                        ...imported
                    };
                    saveSettings();
                    loadSettingsToUI();
                    renderSpriteDomainsUI();
                    toastr.success('Settings imported successfully');
                } catch (error) {
                    toastr.error('Failed to import settings: ' + error.message);
                }
            };
            reader.readAsText(file);

            // Reset file input
            $(this).val('');
        });
    }

    /**
     * Load settings values into UI elements
     */
    function loadSettingsToUI() {
        $('#sprite-council-enabled').prop('checked', spriteCouncilSettings.enabled);
        $('#sprite-council-chair-mode').prop('checked', spriteCouncilSettings.chair_mode);
        $('#sprite-council-max-speakers').val(spriteCouncilSettings.max_speakers);
        $('#sprite-council-max-speakers-value').text(spriteCouncilSettings.max_speakers);
        $('#sprite-council-brevity-enabled').prop('checked', spriteCouncilSettings.brevity_enabled);
        $('#sprite-council-brevity-instruction').val(spriteCouncilSettings.brevity_instruction);
        renderSpriteDomainsUI();
    }

    /**
     * Handle generation in Chair Mode by forcing the correct character
     */
    function handleChairModeGeneration() {
        try {
            const context = SillyTavern.getContext();

            // Make sure we're in a group chat
            if (!context.groupId) {
                console.log('[Sprite Council] Not in a group chat, skipping Chair Mode handling');
                return;
            }

            const groupMembers = getGroupMemberNames();
            if (!groupMembers || groupMembers.length === 0) {
                console.log('[Sprite Council] No group members found');
                return;
            }

            const chairSprite = spriteCouncilSettings.chair_sprite;
            if (!chairSprite) {
                console.log('[Sprite Council] No chair sprite configured');
                return;
            }

            // Determine which character should speak next
            const nextSpeaker = getNextChairModeSpeaker(context.chat, groupMembers, chairSprite);
            console.log('[Sprite Council] Next speaker in Chair Mode:', nextSpeaker);

            // Get the character ID for the next speaker
            const chid = getCharacterIdByName(nextSpeaker);
            if (chid === null) {
                console.error('[Sprite Council] Could not find character ID for:', nextSpeaker);
                return;
            }

            console.log('[Sprite Council] Forcing generation for speaker:', nextSpeaker);

            // Set flag to allow our forced generation through the interceptor
            isChairModeForcing = true;

            // Force generation by clicking the Force Talk button for this character
            const success = forceCharacterReply(chid);
            if (success) {
                console.log('[Sprite Council] Successfully forced generation for:', nextSpeaker);
                // Clear flag after a short delay (generation is async)
                setTimeout(() => {
                    isChairModeForcing = false;
                }, 500);
            } else {
                console.error('[Sprite Council] Failed to force generation for:', nextSpeaker);
                isChairModeForcing = false;
            }

        } catch (error) {
            console.error('[Sprite Council] Error in handleChairModeGeneration:', error);
        }
    }

    /**
     * Handle what happens after a character generation completes in Chair Mode
     * If the chair just called on someone, trigger that person's generation
     */
    function handleChairModeAfterGeneration() {
        try {
            const context = SillyTavern.getContext();

            // Make sure we're in a group chat
            if (!context.groupId) {
                return;
            }

            const groupMembers = getGroupMemberNames();
            if (!groupMembers || groupMembers.length === 0) {
                return;
            }

            const chairSprite = spriteCouncilSettings.chair_sprite;
            if (!chairSprite) {
                return;
            }

            // Find the last non-system message
            let lastMessage = null;
            for (let i = context.chat.length - 1; i >= 0; i--) {
                if (context.chat[i].mes && !context.chat[i].is_system) {
                    lastMessage = context.chat[i];
                    break;
                }
            }

            if (!lastMessage || lastMessage.is_user) {
                // Last message is from user or doesn't exist, nothing to do
                return;
            }

            const lastSpeaker = lastMessage.name;

            // Only proceed if the last speaker was the chair
            if (lastSpeaker === chairSprite) {
                // Check if the chair called on someone
                const calledSprite = detectCalledSprite(lastMessage.mes, groupMembers, chairSprite);
                if (calledSprite) {
                    console.log(`[Sprite Council] Chair called on ${calledSprite}, triggering their response`);

                    // Get the character ID for the called sprite
                    const chid = getCharacterIdByName(calledSprite);
                    if (chid === null) {
                        console.error('[Sprite Council] Could not find character ID for:', calledSprite);
                        return;
                    }

                    // Set flag to allow our forced generation through the interceptor
                    isChairModeForcing = true;

                    // Force generation by clicking the Force Talk button for this character
                    const success = forceCharacterReply(chid);
                    if (success) {
                        console.log('[Sprite Council] Successfully forced generation for:', calledSprite);
                        // Clear flag after a short delay (generation is async)
                        setTimeout(() => {
                            isChairModeForcing = false;
                        }, 500);
                    } else {
                        console.error('[Sprite Council] Failed to force generation for:', calledSprite);
                        isChairModeForcing = false;
                    }
                }
                // If chair didn't call on anyone, we don't auto-generate
                // Wait for next user message
            }
            // If last speaker was not the chair, we also wait for next user message

        } catch (error) {
            console.error('[Sprite Council] Error in handleChairModeAfterGeneration:', error);
        }
    }

    /**
     * Register event listeners for Chair Mode and other features
     */
    function registerEventListeners() {
        // Get eventSource and event_types the proper way according to SillyTavern documentation
        // See: https://docs.sillytavern.app/for-contributors/writing-extensions/
        let eventSourceObj;
        let eventTypes;

        try {
            // The official way to access eventSource and event_types in SillyTavern extensions
            const context = SillyTavern.getContext();
            if (context && context.eventSource) {
                eventSourceObj = context.eventSource;
                eventTypes = context.event_types;
                console.log('[Sprite Council] Found event source via SillyTavern.getContext()');
            }
        } catch (e) {
            console.error('[Sprite Council] Error accessing SillyTavern.getContext():', e.message);
        }

        if (!eventSourceObj) {
            console.error('[Sprite Council] eventSource not available, cannot register event listeners!');
            console.error('[Sprite Council] SillyTavern.getContext() did not provide eventSource');
            return false;
        }

        console.log('[Sprite Council] Registering event listeners');
        console.log('[Sprite Council] eventSource:', eventSourceObj);

        // Listen for MESSAGE_SENT event (when user sends a message)
        const messageSentEvent = eventTypes?.MESSAGE_SENT || 'message_sent';
        eventSourceObj.on(messageSentEvent, () => {
            console.log('[Sprite Council] MESSAGE_SENT event received');

            // In Chair Mode, we manually trigger generation for the correct character
            if (spriteCouncilSettings.enabled && spriteCouncilSettings.chair_mode && spriteCouncilSettings.chair_sprite) {
                setTimeout(() => {
                    handleChairModeGeneration();
                }, 100); // Small delay to ensure message is fully processed
            }
        });

        // Listen for GENERATION_ENDED event (when AI finishes generating)
        const generationEndedEvent = eventTypes?.GENERATION_ENDED || 'generation_ended';
        eventSourceObj.on(generationEndedEvent, () => {
            console.log('[Sprite Council] GENERATION_ENDED event received');

            // In Chair Mode, check if we need to trigger the next speaker
            if (spriteCouncilSettings.enabled && spriteCouncilSettings.chair_mode && spriteCouncilSettings.chair_sprite) {
                setTimeout(() => {
                    handleChairModeAfterGeneration();
                }, 100); // Small delay to ensure generation is fully processed
            }
        });

        // Update dropdowns when group chat changes
        const chatChangedEvent = eventTypes?.CHAT_CHANGED || 'chat_changed';
        eventSourceObj.on(chatChangedEvent, () => {
            console.log('[Sprite Council] Chat changed - updating dropdowns');
            updateChairSpriteDropdown();
            updateAddCharacterDropdown();
        });

        // Also update when characters are added/removed from group
        const groupUpdatedEvent = eventTypes?.GROUP_UPDATED || 'group_updated';
        eventSourceObj.on(groupUpdatedEvent, () => {
            console.log('[Sprite Council] Group updated - updating dropdowns');
            updateChairSpriteDropdown();
            updateAddCharacterDropdown();
        });

        console.log('[Sprite Council] Event listeners registered successfully');
        return true;
    }

    /**
     * Initialize the extension
     */
    function init() {
        console.log(`[Sprite Council v${EXTENSION_VERSION}] Extension loaded`);

        // Load settings from storage
        loadSettings();

        // Create settings UI
        createSettingsUI();
        bindUIEvents();
        loadSettingsToUI();

        // Try to register event listeners immediately
        const registered = registerEventListeners();

        // If event source isn't ready yet, retry with backoff
        if (!registered) {
            console.log('[Sprite Council] EventSource not ready yet, will retry...');
            let retryCount = 0;
            const maxRetries = 10;
            const retryInterval = setInterval(() => {
                retryCount++;
                console.log(`[Sprite Council] Retry ${retryCount}/${maxRetries} - attempting to register event listeners...`);

                const success = registerEventListeners();
                if (success) {
                    console.log('[Sprite Council] Event listeners registered successfully on retry');
                    clearInterval(retryInterval);
                } else if (retryCount >= maxRetries) {
                    console.error('[Sprite Council] Failed to register event listeners after maximum retries');
                    clearInterval(retryInterval);
                }
            }, 500); // Retry every 500ms
        }

        // Update dropdowns when settings panel is opened
        $(document).on('click', '#sprite-council-settings .inline-drawer-toggle', function() {
            setTimeout(() => {
                updateChairSpriteDropdown();
                updateAddCharacterDropdown();
            }, 100);
        });

        // If Chair Mode is already enabled on load, ensure group is in manual mode
        // Wait a bit for SillyTavern to fully initialize
        setTimeout(() => {
            if (spriteCouncilSettings.chair_mode) {
                console.log('[Sprite Council] Chair Mode is enabled, ensuring group is in manual mode');
                toggleChairModeActivationStrategy(true);
            }
        }, 1000);

        console.log(`[Sprite Council v${EXTENSION_VERSION}] Initialization complete`);
    }

    // Initialize when jQuery is ready
    jQuery(function() {
        init();
    });

})();
