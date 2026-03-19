import { Hono } from "hono";
import { cors } from "hono/cors";
import type { GameState, CreateGameResponse, JoinGameResponse, MoveRequest, UndoRequest } from "../shared/types";
import { createInitialGameState, applyMove, applyUndo, applyUndoFirstMove, generateId, generateToken } from "../shared/gameLogic";

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
  const gameData = await c.env.GAMES.get(`game:${gameId}`);

  if (!gameData) {
    return c.json({ error: "Game not found" }, 404);
  }

  const game: GameState = JSON.parse(gameData);

  // Don't expose player tokens in the response
  const publicGame = {
    ...game,
    players: {
      x: game.players.x ? true : false,
      o: game.players.o ? true : false,
    },
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

  if (game.players.o) {
    return c.json({ error: "Game is full" }, 400);
  }

  const playerToken = generateToken();
  game.players.o = playerToken;
  game.updatedAt = Date.now();

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(game));

  const response: JoinGameResponse = {
    playerToken,
    player: 'o',
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

  // Reset the game state but keep players
  const centerKey = `${Math.floor(200 / 2)},${Math.floor(200 / 2)}`;
  const resetGame: GameState = {
    ...game,
    cells: { [centerKey]: 'x' },
    currentPlayer: 'o',
    movesThisTurn: 0,
    firstMoveKey: null,
    lastTurnMoves: null,
    winner: null,
    winningCells: [],
    updatedAt: Date.now(),
  };

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(resetGame));

  return c.json({ success: true });
});

// Leave/close game
app.post("/api/games/:id/leave", async (c) => {
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

  // Mark game as closed and delete after a short delay (so other player can see)
  const closedGame: GameState = {
    ...game,
    winner: 'closed' as any,  // Special marker
    updatedAt: Date.now(),
  };

  await c.env.GAMES.put(`game:${gameId}`, JSON.stringify(closedGame), {
    expirationTtl: 60,  // Delete after 60 seconds
  });

  return c.json({ success: true });
});

export default app;
