//  Copyright (c) 2022, Infinity Systems and contributors
// For license information, please see license.txt
frappe.provide("erpnext.accounts.dimensions");

frappe.ui.form.on('Enhanced Payment Entry', {
	refresh: function(frm) {
		if(frm.doc.docstatus==1) {			
			frm.add_custom_button(__('View GL Entry'), function() {
				frappe.route_options = {
					"voucher_no": frm.doc.name,
					"from_date": frm.doc.posting_date,
					"to_date": frm.doc.posting_date,
					"company": frm.doc.company,
					group_by: ""
				};
				frappe.set_route("query-report", "General Ledger");
			}, "fa fa-table");
		}

		if (frm.is_new()){
			var company_currency = frm.doc.company ? frappe.get_doc(":Company", frm.doc.company).default_currency: "";
			frm.set_currency_labels(["allocated", "difference"], company_currency);
		
			frm.toggle_display(["rate", "base_amount"], (frm.doc.account_currency != company_currency));
		
			frm.set_currency_labels(["amount"], frm.doc.account_currency);
			frm.set_currency_labels(["base_amount"], company_currency);
			frm.set_currency_labels(["account_balance"], frm.doc.account_currency);
			frm.set_currency_labels(["base_amount"], company_currency, 'accounts');
		
			frm.refresh_field('account_balance')
		}

		frm.set_query("account", function() {
			var account_types = ["Bank", "Cash"];
			return {
				filters: {
					"account_type": ["in", account_types],
					"is_group": 0,
					"company": frm.doc.company
				}
			}
		});

		frm.set_query("account", 'accounts', function() {
			return {
				filters: {
					"is_group": 0,
					"company": frm.doc.company
				}
			}
		});
		frm.set_query("cost_center", 'accounts', function() {
			return {
				filters: {
					"is_group": 0,
					"company": frm.doc.company
				}
			}
		});
		frm.set_query("cost_center", function() {
			return {
				filters: {
					"is_group": 0,
					"company": frm.doc.company
				}
			}
		});
	},

	company: function(frm) {
		var company_currency = frm.doc.company ? frappe.get_doc(":Company", frm.doc.company).default_currency: "";
		frm.set_currency_labels(["allocated", "difference"], company_currency);
		erpnext.accounts.dimensions.update_dimension(frm, frm.doctype);
	},

	before_save: function(frm){
		recalculate_all(frm);
		propagate_cost_center(frm);
	},

	mode_of_payment: function(frm){
		if (frm.doc.mode_of_payment){
			frappe.call({
				method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account",
				args: {
					"mode_of_payment": frm.doc.mode_of_payment,
					"company": frm.doc.company
				},
				callback: function(r) {
					if(r.message) {
						frm.set_value('account',r.message.account)
					}
				}
			});
		}
	},

	account: function(frm){
		frappe.call({
			method: "erpnext.accounts.utils.get_balance_on",
			args: {
				company: frm.doc.company,
				date: frm.doc.posting_date,
				account: frm.doc.account
			},
			callback: function(r) {
				if(r) {
					frm.set_value('account_balance', r.message);
				}
			}
		})
	},

	account_currency: function(frm){
		var company_currency = frm.doc.company? frappe.get_doc(":Company", frm.doc.company).default_currency: "";
		
		frm.toggle_display(["rate", "base_amount"], (frm.doc.account_currency != company_currency));
		
		frm.set_currency_labels(["amount"], frm.doc.account_currency);
		frm.set_currency_labels(["base_amount"], company_currency);
		frm.set_currency_labels(["account_balance"], frm.doc.account_currency);
		frm.set_currency_labels(["base_amount"], company_currency, 'accounts');
		
		frm.refresh_field('account_balance')

		if (frm.doc.account_currency != company_currency){
			frappe.call({
				method: "erpnext.setup.utils.get_exchange_rate",
				args: {
					from_currency: frm.doc.account_currency,
					to_currency: company_currency,
					transaction_date: frm.doc.posting_date
				},
				callback: function(r) {
					if(r) {
						frm.set_value('rate', r.message);
					}
				}
			})
		}
	},

	cost_center: function(frm) {
		propagate_cost_center(frm);
	},

	amount: function(frm){
		calculate_base_amount(frm);
		recalculate_all(frm);
	},
	rate: function(frm){
		calculate_base_amount(frm);
		recalculate_all(frm);
	},
	validate: function(frm){
		$.each(frm.doc.accounts || [], function(i, d) {
			if(!d.amount || d.amount == 0){
				frappe.throw(__('Amount in row # ' + d.idx +' is invalid!'));
			}
		});
	},

	before_submit: function(frm){
		if (frm.doc.difference){
			if (flt(frm.doc.difference) != 0){
				//frappe.throw(__('Difference is not Zero!'));
			}
		}
	}
});


frappe.ui.form.on('Enhanced Payment Entry Account', {
	accounts_add: function(frm, cdt, cdn) {
		var row = locals[cdt][cdn];
		if (!row.cost_center && frm.doc.cost_center){
			row.cost_center = frm.doc.cost_center
		}
	},

	account: function(frm, cdt, cdn){
		var company_currency = frm.doc.company? frappe.get_doc(":Company", frm.doc.company).default_currency: "";
		var row = locals[cdt][cdn];

		// Reset currency first
		frappe.model.set_value(row.doctype,row.name, 'account_currency', null);

		// Get account currency
		frappe.db.get_value('Account', row.account, ['account_currency','account_type']).then(ac=>{
			if(ac.message.account_currency){
				frappe.model.set_value(row.doctype,row.name, 'account_currency', ac.message.account_currency);
			}
			if(ac.message.account_type){
				frappe.model.set_value(row.doctype,row.name, 'party_type', ac.message.account_type);
			}
		});

		// Get balance
		frappe.call({
			method: "erpnext.accounts.utils.get_balance_on",
			args: {
				company: frm.doc.company,
				date: frm.doc.posting_date,
				account: row.account
			},
			callback: function(r) {
				if(r.message) {
					frappe.model.set_value(row.doctype,row.name, 'account_balance', r.message);
					frm.refresh_field('accounts');
				}
			}
		});
	},

	account_currency: function(frm, cdt, cdn){
		var row = locals[cdt][cdn];
		var company_currency = frm.doc.company? frappe.get_doc(":Company", frm.doc.company).default_currency: "";

		frm.toggle_display("rate", (row.account_currency != company_currency), 'accounts');
		frm.toggle_display("base_amount", (row.account_currency != company_currency), 'accounts');

		if (row.account_currency != company_currency){
			frappe.call({
				method: "erpnext.setup.utils.get_exchange_rate",
				args: {
					from_currency: row.account_currency,
					to_currency: company_currency,
					transaction_date: frm.doc.posting_date
				},
				callback: function(r) {
					if(r) {
						frappe.model.set_value(row.doctype,row.name, 'rate', r.message);	
					}
				}
			})
		}
	},

	amount: function(frm, cdt, cdn){
		recalculate_all(frm);
	}
});


function calculate_base_amount(frm){
	if (frm.doc.amount && frm.doc.rate){
		frm.set_value('base_amount', flt(frm.doc.amount) * flt(frm.doc.rate))
	}
}

var recalculate_all = function(frm){
	var company_currency = frm.doc.company? frappe.get_doc(":Company", frm.doc.company).default_currency: "";
	var allocated = 0;
	var amount = frm.doc.account_currency == company_currency? frm.doc.amount : frm.doc.base_amount;
	$.each(frm.doc.accounts, function(i, d) {
		if (d.account_currency != company_currency){
			if (d.rate && d.rate > 0){
				frappe.model.set_value(d.doctype,d.name, 'base_amount', flt(d.amount) * flt(d.rate));	
			}else{
				frappe.throw(__('Missing Exchange Rate in row ' + d.idx));
			}
		}
		allocated += d.account_currency == company_currency? d.amount : d.base_amount;
	});
	frm.set_value('allocated', flt(allocated));
	frm.set_value('difference', flt(amount) - flt(allocated));
}

var propagate_cost_center = function(frm){
	$.each(frm.doc.accounts || [], function(i, d) {
		if(!d.cost_center && d.account) d.cost_center = frm.doc.cost_center;
	});
	refresh_field("accounts");
}
