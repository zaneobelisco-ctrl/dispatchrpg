  /**
   * Robust getData:
   * - garante que data.system exista (fallbacks: actor.system, actor.data?.data, data.system)
   * - garante atributos/pericias/pv/pp/san padrão
   * - fornece computed fields para o template
   * - **Também** duplica os campos para data.atributos e data.pericias para compatibilidade com o template
   */
  getData() {
    const data = super.getData();

    // Obtain actor if available
    const actor = this.actor ?? (data?.actor ? data.actor : null);

    // Try several fallbacks to populate systemData
    let systemData = {};
    if (data?.system && Object.keys(data.system).length) {
      systemData = foundry.utils.duplicate(data.system);
    } else if (actor?.system && Object.keys(actor.system).length) {
      systemData = foundry.utils.duplicate(actor.system);
    } else if (actor?.data?.data && Object.keys(actor.data.data).length) {
      // older shapes
      systemData = foundry.utils.duplicate(actor.data.data);
    } else {
      // final fallback: empty object
      systemData = {};
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

    // Attach the normalized system data back to data for the template AND for actor updates
    data.system = systemData;

    // --- CRITICAL: keep backward-compatible fields expected by the template ---
    // many template helpers expect data.atributos and data.pericias — populate them.
    data.atributos = foundry.utils.duplicate(systemData.atributos);
    data.pericias = foundry.utils.duplicate(systemData.pericias);
    data.pv = systemData.pv;
    data.pp = systemData.pp;
    data.san = systemData.san;

    // Computed fields
    const des = Number(systemData.atributos.DES) || 0;
    const vig = Number(systemData.atributos.VIG) || 0;
    data.computed = data.computed || {};
    data.computed.iniciativaBonus = des;
    data.computed.taxaCuraBonus = vig;
    data.computed.movimento = 6 + des;

    // Helpers for iteration (template may iterate over data.atributos/pericias)
    data._attrKeys = Object.keys(data.atributos);
    data._periciasKeys = Object.keys(data.pericias);

    return data;
  }
