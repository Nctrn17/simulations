import { brancher } from "../worker-commun.js";
import { Carte, Partie, config } from "./sim.js";

brancher({ Carte, Partie, config });
