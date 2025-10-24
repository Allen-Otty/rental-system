// AI Assistant for property recommendations
class AIAssistant {
    constructor() {
        this.properties = window.properties || [];
        this.initElements();
        this.initEventListeners();
        this.commonQuestions = {
            'hello': 'Hello! How can I help you find your perfect home today?',
            'hi': 'Hi there! Looking for a new place to live? I can help you find the perfect property.',
            'help': 'I can help you find properties, answer questions about listings, or provide information about neighborhoods. Just ask!'
        };
    }

    initElements() {
        this.assistantButton = document.getElementById('ai-assistant-button');
        this.assistantContainer = document.getElementById('ai-assistant-container');
        this.assistantClose = document.getElementById('ai-assistant-close');
        this.messagesContainer = document.getElementById('ai-assistant-messages');
        this.inputField = document.getElementById('ai-assistant-input');
        this.sendButton = document.getElementById('ai-assistant-send');
    }

    initEventListeners() {
        // Toggle assistant visibility
        this.assistantButton.addEventListener('click', () => {
            this.assistantContainer.classList.toggle('active');
        });

        // Close assistant
        this.assistantClose.addEventListener('click', () => {
            this.assistantContainer.classList.remove('active');
        });

        // Send message on button click
        this.sendButton.addEventListener('click', () => {
            this.handleUserMessage();
        });

        // Send message on Enter key
        this.inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleUserMessage();
            }
        });
    }

    handleUserMessage() {
        const message = this.inputField.value.trim();
        if (message === '') return;

        // Add user message to chat
        this.addMessage(message, 'user');
        this.inputField.value = '';

        // Process message and respond
        setTimeout(() => {
            const response = this.generateResponse(message);
            this.addMessage(response, 'ai');
        }, 500);
    }

    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = sender === 'user' ? 'user-message' : 'ai-message';
        messageDiv.textContent = text;
        this.messagesContainer.appendChild(messageDiv);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    generateResponse(message) {
        message = message.toLowerCase();

        // Check for common greetings
        for (const [key, response] of Object.entries(this.commonQuestions)) {
            if (message.includes(key)) {
                return response;
            }
        }

        // Property search queries
        if (message.includes('bedroom') || message.includes('bath') || 
            message.includes('apartment') || message.includes('house')) {
            return this.handlePropertySearch(message);
        }

        // Location queries
        if (message.includes('location') || message.includes('area') || 
            message.includes('neighborhood') || message.includes('where')) {
            return this.handleLocationQuery(message);
        }

        // Price queries
        if (message.includes('price') || message.includes('cost') || 
            message.includes('rent') || message.includes('expensive') || 
            message.includes('cheap')) {
            return this.handlePriceQuery(message);
        }

        // Default response
        return "I'm not sure how to help with that. You can ask me about available properties, locations, prices, or features like number of bedrooms.";
    }

    handlePropertySearch(message) {
        let matchingProperties = [...this.properties];
        let responseDetails = [];

        // Filter by bedrooms
        if (message.includes('bedroom')) {
            const bedroomMatch = message.match(/(\d+)\s*bedroom/);
            if (bedroomMatch) {
                const bedrooms = parseInt(bedroomMatch[1]);
                matchingProperties = matchingProperties.filter(p => p.bedrooms === bedrooms);
                responseDetails.push(`${bedrooms} bedroom`);
            }
        }

        // Filter by property type
        if (message.includes('apartment')) {
            matchingProperties = matchingProperties.filter(p => p.title.toLowerCase().includes('apartment'));
            responseDetails.push('apartment');
        } else if (message.includes('house')) {
            matchingProperties = matchingProperties.filter(p => p.title.toLowerCase().includes('house'));
            responseDetails.push('house');
        }

        // Generate response
        if (matchingProperties.length > 0) {
            const propertyCount = matchingProperties.length;
            const propertyList = matchingProperties.slice(0, 2).map(p => `"${p.title}" for ${p.price}`).join(' and ');
            
            return `I found ${propertyCount} ${responseDetails.join(' ')} properties that might interest you. ${propertyList}${propertyCount > 2 ? ' and more' : ''}. Would you like more details about any of these?`;
        } else {
            return `I couldn't find any ${responseDetails.join(' ')} properties. Would you like to try a different search?`;
        }
    }

    handleLocationQuery(message) {
        // Extract location from message if possible
        let locationQuery = '';
        const locations = ['downtown', 'suburbia', 'university', 'skyline', 'woodland'];
        
        for (const loc of locations) {
            if (message.includes(loc)) {
                locationQuery = loc;
                break;
            }
        }

        if (locationQuery) {
            const matchingProperties = this.properties.filter(p => 
                p.location.toLowerCase().includes(locationQuery));
            
            if (matchingProperties.length > 0) {
                return `I found ${matchingProperties.length} properties in the ${locationQuery} area. Would you like to see them?`;
            } else {
                return `I don't have any properties listed in the ${locationQuery} area right now.`;
            }
        }

        // General location information
        return "We have properties in various locations including Downtown, Suburbia, University District, Skyline District, and Woodland Area. Which area interests you?";
    }

    handlePriceQuery(message) {
        // Check for price range
        const priceMatch = message.match(/(\$\d+,?\d*|\d+,?\d*\s*dollars)/);
        
        if (priceMatch) {
            const priceStr = priceMatch[0].replace('$', '').replace('dollars', '').replace(',', '').trim();
            const price = parseInt(priceStr);
            
            const affordableProperties = this.properties.filter(p => {
                const propertyPrice = parseInt(p.price.replace('$', '').replace('/month', '').replace(',', ''));
                return propertyPrice <= price;
            });
            
            if (affordableProperties.length > 0) {
                return `I found ${affordableProperties.length} properties within your budget of $${price}. Would you like to see them?`;
            } else {
                return `I don't have any properties under $${price} at the moment. Our lowest priced property is ${this.getLowestPrice()}.`;
            }
        }

        // General price information
        return `Our properties range from ${this.getLowestPrice()} to ${this.getHighestPrice()} per month. What's your budget?`;
    }

    getLowestPrice() {
        if (this.properties.length === 0) return '$0';
        
        let lowest = Number.MAX_VALUE;
        this.properties.forEach(p => {
            const price = parseInt(p.price.replace('$', '').replace('/month', '').replace(',', ''));
            if (price < lowest) lowest = price;
        });
        
        return `$${lowest.toLocaleString()}/month`;
    }

    getHighestPrice() {
        if (this.properties.length === 0) return '$0';
        
        let highest = 0;
        this.properties.forEach(p => {
            const price = parseInt(p.price.replace('$', '').replace('/month', '').replace(',', ''));
            if (price > highest) highest = price;
        });
        
        return `$${highest.toLocaleString()}/month`;
    }
}

// Initialize AI Assistant when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.aiAssistant = new AIAssistant();
});