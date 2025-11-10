// Dispatch RPG - actor-sheet.js (v13 stable version)
export class DispatchActorSheet extends ActorSheet {
  /** Default options */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["dispatch", "sheet", "actor"],
      template: "systems/dispatchrpg/templates/actor-sheet.html",
      width: 920,
      height: 760,
      resizable: true,
      submitOnClose: true
    });
  }

  /** Garantir que salva antes de fechar */
  async close(options = {}) {
    try {
      await this.saveSheetData();
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.warn("DispatchRPG | Erro ao salvar ao fechar:", err);
    }
    return super.close(options);
  }

  /** Preparar dados do sheet */
  getData() {
    const data = super.getData();
    data.system.atributos ??= { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };
    const defaultPericias = {
      "Atletismo":0,"Condução":0,"Desarmado":0,"Dissimulação":0,"Evasão":0,"Vontade":0,
      "Furtividade":0,"Influência":0,"Intuição":0,"Língua Nativa":0,"Malandragem":0,
      "Musculatura":0,"Ocultação":0,"Pesquisa":0,"Percepção":0,"Primeiros Socorros":0
    };
    data.system.pericias ??= {};
    for (let p in defaultPericias)
      if (data.system.pericias[p] === undefined) data.system.pericias[p] = defaultPericias[p];

    data.system.pv ??= 0;
    data.system.pp ??= 0;
    data.system.san ??= 0;

    const des = Number(data.system.atributos.DES) || 0;
    const vig = Number(data.system.atributos.VIG) || 0;
    data.computed = {
      iniciativaBonus: des,
      taxaCuraBonus: vig,
      movimento: 6 + des
    };
    data._attrKeys = Object.keys(data.system.atributos);
    data._periciasKeys = Object.keys(data.system.pericias);
    return data;
  }

  /** Listeners */
  activateListeners(html) {
    super.activateListeners(html);
    const root = this.element;

    root.on("click", ".btn-upload-photo", (ev) => this._onUploadPhoto(ev));
    root.on("click", ".roll", (ev) => this._onRollPericia(ev));
    root.on("click", ".roll-iniciativa", (ev) => this._onRollIniciativa(ev));
    root.on("click", ".roll-taxa", (ev) => this._onRollTaxaCura(ev));
    root.on("click", ".btn-save-sheet", async (ev) => {
      ev.preventDefault();
      await this.saveSheetData();
      ui.notifications.info("Ficha salva!");
    });

    // duplo clique em perícia para upar
    root.on("dblclick", ".skill-input", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name;
      const skill = name.replace("system.pericias.", "");
      const val = Number(input.value) || 0;
      const delta = ev.shiftKey ? -1 : 1;
      const novo = Math.max(0, val + delta);
      const base = foundry.utils.duplicate(this.actor.system.pericias);
      base[skill] = novo;
      await this.actor.update({ "system.pericias": base });
      input.value = novo;
      ui.notifications.info(`${skill}: ${novo}`);
    });
  }

  /** Upload de foto */
  _onUploadPhoto(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      callback: path => this.actor.update({ img: path })
    });
    fp.render(true);
  }

  /** Roll de perícia */
  async _onRollPericia(event) {
    event.preventDefault();
    const skill = event.currentTarget.dataset.skill;
    if (!skill) return;
    const map = {
      "Atletismo":"FOR","Condução":"DES","Desarmado":"FOR","Dissimulação":"CAR","Evasão":"DES","Vontade":"POD",
      "Furtividade":"DES","Influência":"CAR","Intuição":"INT","Língua Nativa":"INT","Malandragem":"POD",
      "Musculatura":"FOR","Ocultação":"INT","Pesquisa":"INT","Percepção":"INT","Primeiros Socorros":"INT"
    };
    const attr = map[skill] || "FOR";
    const a = this.actor.system.atributos[attr] || 0;
    const p = this.actor.system.pericias[skill] || 0;
    const formula = `1d20 + ${a} + ${p}`;
    const roll = await new Roll(formula).roll({ async: true });
    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor.name} — ${skill}` });
  }

  /** Iniciativa */
  async _onRollIniciativa(event) {
    event.preventDefault();
    const des = this.actor.system.atributos.DES || 0;
    const roll = await new Roll(`1d20 + ${des}`).roll({ async: true });
    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor.name} — Iniciativa` });
  }

  /** Taxa de Cura */
  async _onRollTaxaCura(event) {
    event.preventDefault();
    const vig = this.actor.system.atributos.VIG || 0;
    const roll = await new Roll(`1d6 + ${vig}`).roll({ async: true });
    roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor.name} — Taxa de Cura` });
  }

  /** Salvamento robusto */
  async saveSheetData() {
    const actor = this.actor;
    if (!actor) return ui.notifications.warn("Actor não encontrado.");
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn("Você não tem permissão para editar este personagem.");
      return;
    }

    // Coleta via FormData
    const formEl = this.element.find("form")[0];
    if (!formEl) return;
    const fd = new FormData(formEl);
    const flat = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string" && v.trim() === "") continue;
      flat[k] = v;
    }

    // Expand e converter
    const expanded = foundry.utils.expandObject(flat);
    function convertNumbers(obj) {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === "string") {
        if (/^-?\d+$/.test(obj)) return parseInt(obj, 10);
        if (/^-?\d+\.\d+$/.test(obj)) return parseFloat(obj);
        return obj;
      }
      if (Array.isArray(obj)) return obj.map(convertNumbers);
      if (typeof obj === "object") {
        const out = {};
        for (const k in obj) out[k] = convertNumbers(obj[k]);
        return out;
      }
      return obj;
    }
    const converted = convertNumbers(expanded);

    // Mapeamento correto para Foundry v13 (data -> system)
    const payload = {};
    if (converted.data) payload.system = converted.data;
    for (const k of Object.keys(converted)) {
      if (k === "data") continue;
      payload[k] = converted[k];
    }

    console.debug("DispatchRPG | Salvando payload:", payload);
    try {
      await actor.update(payload);
      console.debug("DispatchRPG | Salvou com sucesso!");
    } catch (err) {
      console.error("DispatchRPG | Falha ao salvar:", err);
      ui.notifications.error("Falha ao salvar (veja console).");
    }
  }
}
