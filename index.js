/**
 * Sprite Council Extension for SillyTavern
 * Acts as a DM for sprite group chats - routes messages to relevant sprites,
 * limits speakers, and enforces brevity.
 */

(function() {
    'use strict';

    // Extension settings with defaults
    let spriteCouncilSettings = {
        enabled: true,
        max_speakers: 2,
        brevity_enabled: true,
        brevity_instruction: "Reply in 3-5 sentences max unless the user specifically asks for more detail.",
        chair_sprite: "Pip",
        sprite_domains: {
            "Pip": ["plan", "schedule", "time", "task", "overwhelmed", "organize", "manage"],
            "Saffron": ["food", "dinner", "meal", "hungry", "cooking", "recipe", "eat"],
            "Echo": ["feelings", "sad", "anxious", "emotion", "feel", "afraid", "worried"],
            "Knot": ["info", "research", "explain", "study", "learn", "understand", "how"],
            "Quorum": ["decide", "choice", "pick", "choose", "decision", "should"]
        }
    };

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
     * Initialize the extension
     */
    function init() {
        console.log('[Sprite Council] Extension loaded');

        // Load settings from extension storage if available
        const context = SillyTavern.getContext();
        if (context.extensionSettings && context.extensionSettings.sprite_council) {
            spriteCouncilSettings = {
                ...spriteCouncilSettings,
                ...context.extensionSettings.sprite_council
            };
        }

        // Listen to MESSAGE_SENT to track user messages
        if (window.eventSource) {
            eventSource.on('MESSAGE_SENT', () => {
                console.log('[Sprite Council] User message sent');
            });

            eventSource.on('GENERATION_ENDED', () => {
                // Could use this to trigger next sprite if doing sequential responses
                console.log('[Sprite Council] Generation ended');
            });
        }

        console.log('[Sprite Council] Settings:', spriteCouncilSettings);
    }

    // Initialize when the script loads
    init();

})();
