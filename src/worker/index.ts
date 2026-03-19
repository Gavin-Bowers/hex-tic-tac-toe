import { Hono } from "hono";
import { cors } from "hono/cors";
import type { GameState, CreateGameResponse, JoinGameResponse, MoveRequest, UndoRequest } from "../shared/types";
import { createInitialGameState, applyMove, applyUndo, applyUndoFirstMove, generateId, generateToken, GRID_SIZE } from "../shared/gameLogic";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors());

// Create a new game
app.post("/api/games", async (c) => {
  const gameId = generateId();
  const playerToken = generateToken();

  const game = createInitialGameState(gameId, playerToken);

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(game));

  const response: CreateGameResponse = {
    gameId,
    playerToken,
    player: 'x',
  };

  return c.json(response);
});

// Get game state
app.get("/api/games/:id", async (c) => {
  const gameId = c.req.param("id");
  const token = c.req.query("token");
  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  // Determine which player this token belongs to (if provided)
  let yourPlayer: 'x' | 'o' | null = null;
  if (token) {
    if (game.players.x === token) yourPlayer = 'x';
    else if (game.players.o === token) yourPlayer = 'o';
  }

  // Don't expose player tokens in the response
  const publicGame = {
    ...game,
    players: {
      x: game.players.x ? true : false,
      o: game.players.o ? true : false,
    },
    yourPlayer,  // Include which player the requester is
  };

  return c.json(publicGame);
});

// Join a game
app.post("/api/games/:id/join", async (c) => {
  const gameId = c.req.param("id");
  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  // Check which slot is available
  let assignedPlayer: 'x' | 'o';
  if (!game.players.x) {
    assignedPlayer = 'x';
  } else if (!game.players.o) {
    assignedPlayer = 'o';
  } else {
    return c.json({ error: "Game is full" }, 400);
  }

  const playerToken = generateToken();
  game.players[assignedPlayer] = playerToken;
  game.updatedAt = Date.now();

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(game));

  const response: JoinGameResponse = {
    playerToken,
    player: assignedPlayer,
  };

  return c.json(response);
});

// Make a move
app.post("/api/games/:id/move", async (c) => {
  const gameId = c.req.param("id");
  const body = await c.req.json<MoveRequest>();

  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  const result = applyMove(game, body.col, body.row, body.playerToken);

  if (result.error) {
    return c.json({ error: result.error }, 400);
  }

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(result.game));

  return c.json({ success: true });
});

// Undo second move (after turn ends)
app.post("/api/games/:id/undo", async (c) => {
  const gameId = c.req.param("id");
  const body = await c.req.json<UndoRequest>();

  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  const result = applyUndo(game, body.playerToken);

  if (result.error) {
    return c.json({ error: result.error }, 400);
  }

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(result.game));

  return c.json({ success: true });
});

// Undo first move (during turn)
app.post("/api/games/:id/undo-first", async (c) => {
  const gameId = c.req.param("id");
  const body = await c.req.json<UndoRequest>();

  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  const result = applyUndoFirstMove(game, body.playerToken);

  if (result.error) {
    return c.json({ error: result.error }, 400);
  }

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(result.game));

  return c.json({ success: true });
});

// Reset game (start new game with same players)
app.post("/api/games/:id/reset", async (c) => {
  const gameId = c.req.param("id");
  const body = await c.req.json<UndoRequest>();

  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  // Verify player is in the game
  if (game.players.x !== body.playerToken && game.players.o !== body.playerToken) {
    return c.json({ error: "Invalid player token" }, 400);
  }

  // Reset the game state, swap player assignments (X becomes O, O becomes X)
  // X always starts on the board, O always takes the first turn
  const centerKey = `${Math.floor(GRID_SIZE / 2)},${Math.floor(GRID_SIZE / 2)}`;
  const resetGame: GameState = {
    ...game,
    cells: { [centerKey]: 'x' },
    currentPlayer: 'o',
    movesThisTurn: 0,
    firstMoveKey: null,
    lastTurnMoves: null,
    winner: null,
    winningCells: [],
    players: {
      x: game.players.o,  // Swap: whoever was O is now X
      o: game.players.x,  // Swap: whoever was X is now O
    },
    updatedAt: Date.now(),
  };

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(resetGame));

  // Return the new player assignment for the requester
  const newPlayer = resetGame.players.x === body.playerToken ? 'x' : 'o';
  return c.json({ success: true, player: newPlayer });
});

// Leave game - free up the slot so another player can join
app.post("/api/games/:id/leave", async (c) => {
  const gameId = c.req.param("id");
  const body = await c.req.json<UndoRequest>();

  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  // Verify player is in the game
  const isPlayerX = game.players.x === body.playerToken;
  const isPlayerO = game.players.o === body.playerToken;
  if (!isPlayerX && !isPlayerO) {
    return c.json({ error: "Invalid player token" }, 400);
  }

  // Free up the player slot
  const updatedGame: GameState = {
    ...game,
    players: {
      x: isPlayerX ? null : game.players.x,
      o: isPlayerO ? null : game.players.o,
    },
    updatedAt: Date.now(),
  };

  // If both players have left, delete the game
  if (!updatedGame.players.x && !updatedGame.players.o) {
    await c.env.GAMES.delete(`game:${gameId}`);
  } else {
    await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(updatedGame));
  }

  return c.json({ success: true });
});

export default app;
