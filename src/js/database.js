// src/js/database.js
const path = require("path");
const fs = require("fs");
const knex = require("knex");

let db;

function initialize(app) {
  const dbPath = path.join(app.getPath("userData"), "ViveStream.db");
  const viveStreamPath = path.join(app.getPath("home"), "ViveStream");
  const oldLibraryPath = path.join(viveStreamPath, "library.json");
  const migratedLibraryPath = path.join(viveStreamPath, "library.json.migrated");

  db = knex({
    client: "sqlite3",
    connection: {
      filename: dbPath,
    },
    useNullAsDefault: true,
  });

  return (async () => {
    try {
      const hasTable = await db.schema.hasTable("videos");
      if (!hasTable) {
        await db.schema.createTable("videos", (table) => {
          table.string("id").primary();
          table.string("title").notNullable();
          table.string("uploader");
          table.integer("duration");
          table.string("upload_date");
          table.string("originalUrl");
          table.string("filePath").unique();
          table.string("coverPath");
          table.string("subtitlePath");
          table.string("type").defaultTo("video");
          table.timestamp("downloadedAt").defaultTo(db.fn.now());
          table.boolean("isFavorite").defaultTo(false);
        });

        if (fs.existsSync(oldLibraryPath) && !fs.existsSync(migratedLibraryPath)) {
          console.log("Found legacy library.json, starting migration...");
          const oldLibrary = JSON.parse(fs.readFileSync(oldLibraryPath, "utf-8"));
          if (oldLibrary && oldLibrary.length > 0) {
            await db.batchInsert("videos", oldLibrary);
            console.log(`Successfully migrated ${oldLibrary.length} items.`);
          }
          fs.renameSync(oldLibraryPath, migratedLibraryPath);
          console.log("Migration complete. Renamed library.json to library.json.migrated.");
        }
      }
    } catch (error) {
      console.error("Database initialization failed:", error);
    }
  })();
}

async function getLibrary() {
  try {
    return await db("videos").select("*").orderBy("downloadedAt", "desc");
  } catch (error) {
    console.error("Error getting library from DB:", error);
    return [];
  }
}

async function addOrUpdateVideo(videoData) {
  try {
    await db("videos")
      .insert(videoData)
      .onConflict("id")
      .merge();
  } catch (error) {
    console.error("Error saving video to DB:", error);
  }
}

async function getVideoById(id) {
    try {
        return await db("videos").where({ id }).first();
    } catch (error) {
        console.error(`Error getting video by ID ${id}:`, error);
        return null;
    }
}

async function deleteVideo(id) {
  try {
    await db("videos").where({ id }).del();
    return { success: true };
  } catch (error) {
    console.error(`Error deleting video ${id} from DB:`, error);
    return { success: false, error: error.message };
  }
}

async function toggleFavorite(id) {
  try {
    const video = await db("videos").where({ id }).first("isFavorite");
    if (video) {
      const isFavorite = !video.isFavorite;
      await db("videos").where({ id }).update({ isFavorite });
      return { success: true, isFavorite };
    }
    return { success: false, message: "Video not found." };
  } catch (error) {
    console.error(`Error toggling favorite for ${id}:`, error);
    return { success: false, error: error.message };
  }
}

async function clearAllMedia() {
    try {
        await db("videos").del();
        return { success: true };
    } catch (error) {
        console.error("Error clearing all media from DB:", error);
        return { success: false, error: error.message };
    }
}

async function shutdown() {
  if (db) {
    await db.destroy();
  }
}

module.exports = {
  initialize,
  getLibrary,
  addOrUpdateVideo,
  getVideoById,
  deleteVideo,
  toggleFavorite,
  clearAllMedia,
  shutdown
};