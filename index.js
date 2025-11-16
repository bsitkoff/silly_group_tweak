/**
 * Sprite Council Extension for SillyTavern
 * Acts as a DM for sprite group chats - routes messages to relevant sprites,
 * limits speakers, and enforces brevity.
 */

(function() {
    'use strict';

    // Extension settings with defaults (no hardcoded sprites)
    const defaultSettings = {
        enabled: true,
        max_speakers: 2,
        brevity_enabled: true,
        brevity_instruction: "Reply in 3-5 sentences max unless the user specifically asks for more detail.",
        chair_sprite: "",
        sprite_domains: {}
    };

    let spriteCouncilSettings = { ...defaultSettings };

    // Keep track of the last user message content for routing
    let lastUserMessage = "";
    let isProcessingGroup = false;

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
     * Select which sprites should respond to the message
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
                return null; // Not in a group chat
            }

            const group = context.groups.find(g => g.id === context.groupId);
            if (!group) return null;

            // Get character names for group members
            const memberNames = [];
            for (const memberId of group.members) {
                const char = context.characters.find(c => c.avatar === memberId);
                if (char) {
                    memberNames.push(char.name);
                }
            }

            return memberNames;
        } catch (error) {
            console.error('[Sprite Council] Error getting group members:', error);
            return null;
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

            // Check if this is a new user message or if we're already processing
            const messageContent = lastUserMsg.mes || "";

            if (messageContent !== lastUserMessage) {
                // New user message - select sprites
                lastUserMessage = messageContent;
                isProcessingGroup = true;

                const selectedSprites = selectSprites(messageContent, groupMembers);

                // Inject mentions into the message to trigger Natural Order
                // We'll add them as a hidden HTML comment so they don't display
                // but the mention system will still detect them
                const mentionText = selectedSprites.join(' ');
                if (!lastUserMsg.mes.includes('<!-- sprite-council-mentions:')) {
                    lastUserMsg.mes += `\n<!-- sprite-council-mentions: ${mentionText} -->`;
                    // Also add as plain text mentions at the end
                    lastUserMsg.mes += `\n\n[To: ${mentionText}]`;
                }
            }

            // Inject brevity instruction into the system prompt
            if (spriteCouncilSettings.brevity_enabled) {
                // Add brevity instruction to the last message in chat as a system note
                const brevityNote = {
                    name: 'System',
                    is_system: true,
                    is_user: false,
                    mes: spriteCouncilSettings.brevity_instruction,
                };

                // Check if we already added this
                const hasBrevityNote = chat.some(msg =>
                    msg.mes === spriteCouncilSettings.brevity_instruction
                );

                if (!hasBrevityNote) {
                    chat.push(brevityNote);
                }
            }

            console.log('[Sprite Council] Intercepted generation for group chat');

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

                        <!-- Max Speakers -->
                        <div class="sprite-council-setting">
                            <label for="sprite-council-max-speakers">
                                Max Speakers per Message: <span id="sprite-council-max-speakers-value">2</span>
                            </label>
                            <input type="range" id="sprite-council-max-speakers"
                                   min="1" max="5" step="1" value="2" class="slider">
                            <small>Maximum number of sprites that can respond to each user message</small>
                        </div>

                        <!-- Chair Sprite -->
                        <div class="sprite-council-setting">
                            <label for="sprite-council-chair-sprite">Chair Character (Default/Fallback)</label>
                            <select id="sprite-council-chair-sprite" class="text_pole">
                                <option value="">None (random selection)</option>
                            </select>
                            <small>Shows all characters in the current group. ✓ = has keywords configured. This character responds when no others match, or when their keywords match.</small>
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
     * Bind UI event listeners
     */
    function bindUIEvents() {
        // Enable/Disable
        $('#sprite-council-enabled').on('change', function() {
            spriteCouncilSettings.enabled = $(this).prop('checked');
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
        $('#sprite-council-max-speakers').val(spriteCouncilSettings.max_speakers);
        $('#sprite-council-max-speakers-value').text(spriteCouncilSettings.max_speakers);
        $('#sprite-council-brevity-enabled').prop('checked', spriteCouncilSettings.brevity_enabled);
        $('#sprite-council-brevity-instruction').val(spriteCouncilSettings.brevity_instruction);
        renderSpriteDomainsUI();
    }

    /**
     * Initialize the extension
     */
    function init() {
        console.log('[Sprite Council] Extension loaded');

        // Load settings from storage
        loadSettings();

        // Create settings UI
        createSettingsUI();
        bindUIEvents();
        loadSettingsToUI();

        // Listen to events
        if (window.eventSource) {
            eventSource.on('MESSAGE_SENT', () => {
                console.log('[Sprite Council] User message sent');
            });

            eventSource.on('GENERATION_ENDED', () => {
                console.log('[Sprite Council] Generation ended');
            });

            // Update dropdowns when group chat changes
            eventSource.on('CHAT_CHANGED', () => {
                console.log('[Sprite Council] Chat changed - updating dropdowns');
                updateChairSpriteDropdown();
                updateAddCharacterDropdown();
            });

            // Also update when characters are added/removed from group
            eventSource.on('GROUP_UPDATED', () => {
                console.log('[Sprite Council] Group updated - updating dropdowns');
                updateChairSpriteDropdown();
                updateAddCharacterDropdown();
            });
        }

        // Update dropdowns when settings panel is opened
        $(document).on('click', '#sprite-council-settings .inline-drawer-toggle', function() {
            setTimeout(() => {
                updateChairSpriteDropdown();
                updateAddCharacterDropdown();
            }, 100);
        });

        console.log('[Sprite Council] Initialization complete');
    }

    // Initialize when jQuery is ready
    jQuery(function() {
        init();
    });

})();
