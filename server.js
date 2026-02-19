// server.js (Requires installing: npm install express socket.io)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// Allow connections from any website (CORS)
const io = new Server(server, { cors: { origin: "*" } });

const suits = ["♠", "♥", "♦", "♣"];
const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const faceChances = { "J": 1, "Q": 2, "K": 3, "A": 4 };

let gameState = {
    players: [], // Array of { id, hand: [] }
    pile: [],
    turnIndex: 0,
    challenge: null
};

function createDeck() {
    let deck = [];
    suits.forEach(s => values.forEach(v => deck.push({v, s})));
    return deck.sort(() => Math.random() - 0.5);
}

function checkSlap(pile) {
    if (pile.length < 2) return false;
    const [t1, t2, t3] = pile;
    
    if (t1.v === t2.v) return true; // Double
    if (t3 && t1.v === t3.v) return true; // Sandwich
    
    // Tens (Top two add to 10)
    const val1 = parseInt(t1.v) || 0;
    const val2 = parseInt(t2.v) || 0;
    if (val1 && val2 && val1 + val2 === 10) return true;
    
    // Marriage (K & Q)
    if ((t1.v === "K" && t2.v === "Q") || (t1.v === "Q" && t2.v === "K")) return true;
    
    // Top Bottom
    if (pile.length >= 3 && t1.v === pile[pile.length - 1].v) return true;

    return false;
}

io.on('connection', (socket) => {
    // Join game
    if (gameState.players.length < 2) {
        gameState.players.push({ id: socket.id, hand: [] });
    }
    
    // Start Game if 2 players
    if (gameState.players.length === 2 && gameState.players[0].hand.length === 0) {
        const deck = createDeck();
        gameState.players[0].hand = deck.slice(0, 26);
        gameState.players[1].hand = deck.slice(26, 52);
    }

    io.emit('updateState', gameState);

    socket.on('playCard', () => {
        const playerIdx = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIdx !== gameState.turnIndex || gameState.players[playerIdx].hand.length === 0) return;

        const card = gameState.players[playerIdx].hand.shift();
        gameState.pile.unshift(card);

        if (faceChances[card.v]) {
            gameState.challenge = { challenger: playerIdx, remaining: faceChances[card.v] };
            gameState.turnIndex = (gameState.turnIndex + 1) % 2;
        } else if (gameState.challenge) {
            gameState.challenge.remaining--;
            if (gameState.challenge.remaining === 0) {
                const winnerIdx = gameState.challenge.challenger;
                gameState.players[winnerIdx].hand.push(...gameState.pile.reverse());
                gameState.pile = [];
                gameState.challenge = null;
                gameState.turnIndex = winnerIdx;
            }
        } else {
            gameState.turnIndex = (gameState.turnIndex + 1) % 2;
        }
        io.emit('updateState', gameState);
    });

    socket.on('slap', () => {
        const playerIdx = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIdx === -1) return; // Spectators can't slap

        if (checkSlap(gameState.pile)) {
            gameState.players[playerIdx].hand.push(...gameState.pile.reverse());
            gameState.pile = [];
            gameState.challenge = null;
            gameState.turnIndex = playerIdx;
            io.emit('notification', `Player ${playerIdx + 1} won the slap!`);
        } else if (gameState.players[playerIdx].hand.length > 0) {
            // Burn card for false slap
            const burn = gameState.players[playerIdx].hand.shift();
            gameState.pile.push(burn); // Goes to bottom of pile
        }
        io.emit('updateState', gameState);
    });

    socket.on('disconnect', () => {
        gameState.players = gameState.players.filter(p => p.id !== socket.id);
        if (gameState.players.length < 2) {
            gameState.pile = []; // Reset if someone leaves
        }
    });
});

server.listen(3000, () => console.log('ERS Server running on port 3000'));
