// Dispatch RPG - actor-sheet.js (robust getData and save for Foundry v13)
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

  /** Ensure saving on close */
  async close(options = {}) {
    try {
      await this.saveSheetData();
      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.warn("DispatchRPG | Erro ao salvar ao fechar:", err);
    }
    return super.close(options);
  }

  /**
   * Robust getData:
   * - garante que data.system exista (fallbacks: actor.system, actor.data?.data, data.system)
   * - garante atributos/pericias/pv/pp/san padrão
   * - fornece computed fields para o template
   */
  getData() {
    const data = super.getData();

    // Obtain actor if available
    const actor = this.actor ?? (data?.actor ? data.actor : null);

    // Try several fallbacks to populate systemData
    let systemData = {};
    if (data?.system && Object.keys(data.system).length) {
      systemData = data.system;
    } else if (actor?.system && Object.keys(actor.system).length) {
      systemData = foundry.utils.duplicate(actor.system);
    } else if (actor?.data?.data && Object.keys(actor.data.data).length) {
      // older shapes
      systemData = foundry.utils.duplicate(actor.data.data);
    } else {
      // final fallback: keep any partial data.system or empty object
      systemData = data.system || {};
    }

    // Ensure attributes object exists
    systemData.atributos = systemData.atributos || { FOR: 0, VIG: 0, DES: 0, INT: 0, POD: 0, CAR: 0 };

    // Ensure pericias
    const defaultPericias = {
      "Atletismo":0,"Condução":0,"Desarmado":0,"Dissimulação":0,"Evasão":0,"Vontade":0,
      "Furtividade":0,"Influência":0,"Intuição":0,"Língua Nativa":0,"Malandragem":0,
      "Musculatura":0,"Ocultação":0,"Pesquisa":0,"Percepção":0,"Primeiros Socorros":0
    };
    systemData.pericias = systemData.pericias || {};
    for (const p of Object.keys(defaultPericias)) {
      if (systemData.pericias[p] === undefined) systemData.pericias[p] = defaultPericias[p];
    }

    // Ensure pv/pp/san
    systemData.pv = systemData.pv ?? 0;
    systemData.pp = systemData.pp ?? 0;
    systemData.san = systemData.san ?? 0;

    // Attach the normalized system data back to data for the template
    data.system = systemData;

    // Computed fields
    const des = Number(systemData.atributos.DES) || 0;
    const vig = Number(systemData.atributos.VIG) || 0;
    data.computed = data.computed || {};
    data.computed.iniciativaBonus = des;
    data.computed.taxaCuraBonus = vig;
    data.computed.movimento = 6 + des;

    // Helpers for iteration
    data._attrKeys = Object.keys(systemData.atributos);
    data._periciasKeys = Object.keys(systemData.pericias);

    return data;
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = this.element;

    root.on("click", ".btn-upload-photo", (ev) => this._onUploadPhoto(ev));
    root.on("click", ".roll", (ev) => this._onRollPericia(ev));
    root.on("click", ".roll-iniciativa", (ev) => this._onRollIniciativa(ev));
    root.on("click", ".roll-taxa", (ev) => this._onRollTaxaCura(ev));
    root.on("click", ".btn-save-sheet", async (ev) => {
      ev.preventDefault();
      try {
        await this.saveSheetData();
        ui.notifications.info("Ficha salva!");
      } catch (err) {
        ui.notifications.error("Erro ao salvar (veja console).");
        console.error("DispatchRPG | Erro salvar via botão:", err);
      }
    });

    // Double click up/down for skill
    root.on("dblclick", ".skill-input", async (ev) => {
      const input = ev.currentTarget;
      const name = input.name; // expect "system.pericias.<Nome>"
      const match = name.match(/^system\.pericias\.(.*)$/) || name.match(/^data\.pericias\.(.*)$/);
      if (!match) return;
      const skillName = match[1];
      const current = Number($(input).val()) || 0;
      const delta = ev.shiftKey ? -1 : 1;
      const newVal = Math.max(0, current + delta);

      // Safe duplicate
      const base = this.actor?.system?.pericias ? foundry.utils.duplicate(this.actor.system.pericias) : {};
      base[skillName] = newVal;
      try {
        await this.actor.update({ "system.pericias": base });
        $(input).val(newVal);
        ui.notifications.info(`${skillName}: ${newVal}`);
      } catch (err) {
        console.error("DispatchRPG | Erro atualizar perícias:", err);
        ui.notifications.error("Erro ao atualizar perícias (veja console).");
      }
    });
  }

  _onUploadPhoto(event) {
    event.preventDefault();
    const fp = new FilePicker({
      type: "image",
      callback: path => {
        if (!this.actor) return ui.notifications.warn("Salve a ficha antes de definir a foto.");
        this.actor.update({ img: path });
      }
    });
    fp.render(true);
  }

  async _onRollPericia(event) {
    event.preventDefault();
    const skill = event.currentTarget.dataset.skill;
    if (!skill) return ui.notifications.warn("Perícia não definida.");
    const map = {
      "Atletismo":"FOR","Condução":"DES","Desarmado":"FOR","Dissimulação":"CAR","Evasão":"DES","Vontade":"POD",
      "Furtividade":"DES","Influência":"CAR","Intuição":"INT","Língua Nativa":"INT","Malandragem":"POD",
      "Musculatura":"FOR","Ocultação":"INT","Pesquisa":"INT","Percepção":"INT","Primeiros Socorros":"INT"
    };
    const attr = map[skill] || "FOR";
    const a = (this.actor?.system?.atributos?.[attr] ?? this.getData().system.atributos[attr]) || 0;
    const p = (this.actor?.system?.pericias?.[skill] ?? this.getData().system.pericias[skill]) || 0;
    const formula = `1d20 + ${a} + ${p}`;
    try {
      const roll = await new Roll(formula).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor?.name || "Personagem"} — ${skill}` });
    } catch (err) {
      console.error("DispatchRPG | Erro rolar perícia:", err);
      ui.notifications.error("Erro ao rolar perícia (veja console).");
    }
  }

  async _onRollIniciativa(event) {
    event.preventDefault();
    const des = this.actor?.system?.atributos?.DES ?? this.getData().system.atributos.DES ?? 0;
    try {
      const roll = await new Roll(`1d20 + ${des}`).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor?.name || "Personagem"} — Iniciativa` });
    } catch (err) {
      console.error("DispatchRPG | Erro rolar iniciativa:", err);
      ui.notifications.error("Erro ao rolar iniciativa (veja console).");
    }
  }

  async _onRollTaxaCura(event) {
    event.preventDefault();
    const vig = this.actor?.system?.atributos?.VIG ?? this.getData().system.atributos.VIG ?? 0;
    try {
      const roll = await new Roll(`1d6 + ${vig}`).roll({ async: true });
      roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${this.actor?.name || "Personagem"} — Taxa de Cura` });
    } catch (err) {
      console.error("DispatchRPG | Erro rolar taxa de cura:", err);
      ui.notifications.error("Erro ao rolar taxa de cura (veja console).");
    }
  }

  /**
   * saveSheetData:
   * - coleta form fields
   * - expande com foundry.utils.expandObject
   * - converte números
   * - mapeia data -> system e envia actor.update(payload)
   */
  async saveSheetData() {
    const actor = this.actor;
    if (!actor) return ui.notifications.warn("Actor não encontrado.");
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn("Você não tem permissão para editar este personagem.");
      return;
    }

    const formEl = this.element.find("form")[0];
    if (!formEl) return;
    const fd = new FormData(formEl);
    const flat = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v === "string" && v.trim() === "") continue;
      flat[k] = v;
    }

    let expanded = {};
    try {
      expanded = foundry.utils.expandObject(flat);
    } catch (err) {
      // fallback manual expansion
      expanded = {};
      for (const key of Object.keys(flat)) {
        const parts = key.split('.');
        let cur = expanded;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (i === parts.length - 1) cur[p] = flat[key];
          else { cur[p] = cur[p] || {}; cur = cur[p]; }
        }
      }
    }

    // convert numbers
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
        for (const k of Object.keys(obj)) out[k] = convertNumbers(obj[k]);
        return out;
      }
      return obj;
    }
    const converted = convertNumbers(expanded);

    // Map data -> system for actor.update
    const payload = {};
    if (converted.data) payload.system = converted.data;
    for (const k of Object.keys(converted)) {
      if (k === "data") continue;
      payload[k] = converted[k];
    }

    if (!Object.keys(payload).length) {
      console.debug("DispatchRPG | payload vazio, nada a atualizar.");
      return;
    }

    console.debug("DispatchRPG | saveSheetData payload (mapped):", payload);
    try {
      await actor.update(payload);
      console.debug("DispatchRPG | actor.update bem sucedido.");
    } catch (err) {
      console.error("DispatchRPG | actor.update falhou:", err);
      ui.notifications.error("Falha ao salvar ficha. Veja o Console para detalhes.");
      throw err;
    }
  }
}
