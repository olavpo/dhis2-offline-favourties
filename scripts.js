const request = require("request");
const XlsxPopulate = require("xlsx-populate");

var serverInfo = {"url": "http://localhost:9000/demo", "username": "admin", "password": "district"};
var DEBUG = false;

async function populate(favId, resourceId) {
	let resource = await getResource(resourceId);
	let data = await getPivotTable(favId);
	
	//this could potentially involve adding columns for ou hierarhy, iso-format perios etc
	let dataSource = prepDataTable(data, ",");

	resource.sheet("DHIS2 Data").usedRange().value(null);
	resource.sheet("DHIS2 Data").cell("A1").value(dataSource);
    return resource;
}


async function create(favId) {
	let data = await getPivotTable(favId);
	
	//this could potentially involve adding columns for ou hierarhy, iso-format perios etc
	let dataSource = prepDataTable(data, ",");
	let resource = await XlsxPopulate.fromBlankAsync();
	resource.addSheet("DHIS2 Data").cell("A1").value(dataSource);
	resource.deleteSheet("Sheet1");
    return resource;
}


function prepDataTable(data, separator) {
	let table = data.rows, headerRow = [], valueCol;
	for (let i = 0; i < data.headers.length; i++) {
		if (!data.headers[i].hidden) headerRow.push(data.headers[i].column);
		if (data.headers[i].name == "value") valueCol = i;
	}
	table.unshift(headerRow);
	
	//TODO: figure our how to deal with decimal points, which depends on excel internationalisation
	//For now, remove trailing .0
	for (let dataRow of table) {
		//If numeric
		if (!isNaN(dataRow[valueCol])) {
			if (Number.isInteger(dataRow[valueCol])) {
				dataRow[valueCol] = parseInt(dataRow[valueCol]);
			}
			else {
				dataRow[valueCol] = parseFloat(dataRow[valueCol]);
			}
		}
	}
	
	return table;
}


//Get data (analytics request) from report table favourite
async function getPivotTable(id) {
	let metadata = await d2Get("reportTables/" + id + ".json?fields=:owner");
	
	let analyticsRequest = "analytics.json?displayProperty=NAME&outputIdScheme=NAME";
	analyticsRequest += optionParam(metadata);
	analyticsRequest += ouParam(metadata);	
	analyticsRequest += peParam(metadata);	
	analyticsRequest += dxParam(metadata);	
	analyticsRequest += catsParam(metadata);	
	analyticsRequest += ougsParam(metadata);	
	analyticsRequest += degsParam(metadata);	
	analyticsRequest += cogsParam(metadata);	
	//analyticsRequest += getRowDimensions(analyticsRequest);
	
	if (DEBUG) console.log(id + " => " + analyticsRequest);
	
	let data = await d2Get(analyticsRequest);
	return data;
}


//Get resource (template)
async function getResource(id) {
	console.log("Getting resource " + id);
	let templateBuffer = await d2GetFile("documents/" + id + "/data");
	let template = await XlsxPopulate.fromDataAsync(templateBuffer);
	return template;
}


//explicitly set rows to all included dimensions. Adds ids, codes etc, but results in largely empty cells
function getRowDimensions(analyticsRequest) {
	let parts = analyticsRequest.split("dimension=");
	let dims = [];
	for (let i = 1; i < parts.length; i++) {
		dims.push(parts[i].split(/\W/)[0]);
	}
	return "&rows=" + dims.join(";");
}


//get misc options
function optionParam(fav) {
	let param = "";
	if (fav.hasOwnProperty("aggregationType")) {
		if (fav.aggregationType != "DEFAULT") param += "&aggregationType=" + fav.aggregationType;
	}
	if (fav.hasOwnProperty("skipRounding")) {
		if (fav.skipRounding) param += "&skipRounding=true";
	} 
	if (fav.hasOwnProperty("completedOnly")) {
		if (fav.completedOnly) param += "&completedOnly=true";
	}
	if (fav.hasOwnProperty("measureCriteria")) {
		param += "&measureCriteria=" + fav.measureCriteria;
	} 
	if (fav.hasOwnProperty("showHierarchy")) {
		if (fav.showHierarchy) param += "&hierarchyMeta=true";
	} 
	
	return param;
}

//get category dimension
function catsParam(fav) {
	let param = "";
	for (let cats of fav.categoryDimensions) {
		param += "&dimension=" + cats.category.id + ":";
		if (cats.categoryOptions.length > 0) {
			for (let co of cats.categoryOptions) {
				param += co.id + ";";
			}
		}
		param = param.slice(0, -1);
	}
	
	return param;
}


//get category option group set dimension
function cogsParam(fav) {
	let param = "";
	for (let cogs of fav.categoryOptionGroupSetDimensions) {
		param += "&dimension=" + cogs.categoryOptionGroupSet.id + ":";
		if (degs.categoryOptionGroups.length > 0) {
			for (let cog of cogs.categoryOptionGroups) {
				param += cog.id + ";";
			}
		}
		param = param.slice(0, -1);
	}
	
	return param;
}


//get data element group set dimension
function degsParam(fav) {
	let param = "";
	for (let degs of fav.dataElementGroupSetDimensions) {
		param += "&dimension=" + degs.dataElementGroupSet.id + ":";
		if (degs.dataElementGroups.length > 0) {
			for (let deg of degs.dataElementGroups) {
				param += deg.id + ";";
			}
		}
		param = param.slice(0, -1);
	}
	
	return param;
}


//get orgunit group set dimension
function ougsParam(fav) {
	let param = "";
	for (let ougs of fav.organisationUnitGroupSetDimensions) {
		param += "&dimension=" + ougs.organisationUnitGroupSet.id + ":";
		if (ougs.organisationUnitGroups.length > 0) {
			for (let oug of ougs.organisationUnitGroups) {
				param += oug.id + ";";
			}
		}
		param = param.slice(0, -1);
	}
	
	return param;
}

//get data params
function dxParam(fav) {
	let param = "&dimension=dx:";
	
	for (let dx of fav.dataDimensionItems) {
		switch (dx.dataDimensionItemType) {
			case "DATA_ELEMENT":
				param += dx.dataElement.id + ";";
				break;
			case "DATA_ELEMENT_OPERAND":
				param += dx.dataElementOperand.id + ";";
				break;
			case "INDICATOR":
				param += dx.indicator.id + ";";			
				break;
			case "REPORTING_RATE":
				param += dx.reportingRate.dimensionItem + ";";			
				break;
			case "PROGRAM_DATA_ELEMENT":
				param += dx.programDataElement.dimensionItem + ";";			
				break;
			case "PROGRAM_INDICATOR":
				param += dx.programIndicator.id + ";";			
				break;
			default:
				console.log("Unsupported dataDimensionItemType:" + dx.dataDimensionItemType)
		}
	}
	
	//remove trailing ; and return
	return param.slice(0, -1);
}


//get period params
function peParam(fav) {
	let param = "&dimension=pe:";
	
	//Fixed
	for (let pe of fav.periods) {
		param += pe.id + ";"
	}
	
	//Relative
	for (let rp in fav.relativePeriods) {
		if (fav.relativePeriods[rp]) {
			param += relativePeriodMap[rp] + ";";
		}
	}
	
	//remove trailing ; and return
	return param.slice(0, -1);
}


//get orgunit params
function ouParam(fav) {
	let param = "&dimension=ou:";
	for (let ou of fav.organisationUnits) {
		param += ou.id + ";"
	}
	
	for (let ouLevel of fav.organisationUnitLevels) {
		param += "LEVEL-" + ouLevel + ";";
	}
	
	for (let ouGroup of fav.itemOrganisationUnitGroups) {
		param += "OU_GROUP-" + ouGroup.id + ";";
	}
	
	if (fav.userOrganisationUnit) param += "USER_ORGUNIT;";
	if (fav.userOrganisationUnitChildren) param += "USER_ORGUNIT_CHILDREN;";
	if (fav.userOrganisationUnitGrandChildren) param += "USER_ORGUNIT_GRANDCHILDREN;";
	
	//remove trailing ; and return
	return param.slice(0, -1);
}




/** DHIS2 COMMUNICATION */
async function d2Get(apiResource) {
	var url = serverInfo.url + "/api/" + apiResource;
	return new Promise(function(resolve, reject) {
		// Do async job
		request.get({
			uri: url,
			json: true,
			auth: {
				"user": serverInfo.username,
				"pass": serverInfo.password
			}
		}, function (error, response, data) {
			if (!error && response.statusCode === 200) {
				resolve(data);
			}
			else {
				console.log("Error in GET");
				console.log(error.message);
				reject({"data": data, "error": error, "status": response});
			}
		});
	});
}


/** DHIS2 COMMUNICATION */
async function d2GetFile(apiResource) {
	var url = serverInfo.url + "/api/" + apiResource;
	return new Promise(function(resolve, reject) {
		// Do async job
		request.get({
			uri: url,
			encoding: null,
			auth: {
				"user": serverInfo.username,
				"pass": serverInfo.password
			}
		}, function (error, response, data) {
			if (!error && response.statusCode === 200) {
				resolve(data);
			}
			else {
				console.log("Error in GET");
				console.log(error.message);
				reject({"data": data, "error": error, "status": response});
			}
		});
	});
}

/** BROWSER FUNCTION */
window.onload = function () {
	window.document.getElementById("makeDocumentButton").addEventListener("click", makeDocument);
	window.document.getElementById("populateDocumentButton").addEventListener("click", populateDocument);
}

async function makeDocument() {
	let favId = window.document.getElementById('favouriteNew').value;
	
	//Create new excel document with pivot table data
	var document = await create(favId);
	
	//Download template
	document.outputAsync()
      .then(function (blob) {
        var url = window.URL.createObjectURL(blob);
		var a = window.document.createElement("a");
		window.document.body.appendChild(a);
		a.href = url;
		a.download = "new_template.xlsx";
		a.click();
		window.URL.revokeObjectURL(url);
		window.document.body.removeChild(a);
		});
}

async function populateDocument() {
	let favId = window.document.getElementById('favourite').value;
	let resourceId = window.document.getElementById('resource').value
	let name = window.document.getElementById('name').value
	
	//Populate template with data from favourite
	let document = await populate(favId, resourceId);
	console.log(document);
	
	//Download template with data
	document.outputAsync()
    .then(function (blob) {
        var url = window.URL.createObjectURL(blob);
		var a = window.document.createElement("a");
		window.document.body.appendChild(a);
		a.href = url;
		a.download = name + ".xlsx";
		a.click();
		window.URL.revokeObjectURL(url);
		window.document.body.removeChild(a);
    });
}


/** "CONSTANTS" */
const relativePeriodMap = {
"biMonthsThisYear": "BIMONTHS_THIS_YEAR",
"last12Months": "LAST_12_MONTHS",
"last12Weeks": "LAST_12_WEEKS",
"last14Days": "LAST_14_DAYS",
"last2SixMonths": "LAST_2_SIXMONTHS",
"last3Days": "LAST_3_DAYS",
"last3Months": "LAST_3_MONTHS",
"last4BiWeeks": "LAST_4_BIWEEKS",
"last4Quarters": "LAST_4_QUARTERS",
"last4Weeks": "LAST_4_WEEKS",
"last5FinancialYears": "LAST_5_FINANCIAL_YEARS",
"last5Years": "LAST_5_YEARS",
"last52Weeks": "LAST_52_WEEKS",
"last6BiMonths": "LAST_6_BIMONTHS",
"last6Months": "LAST_6_MONTHS",
"last7Days": "LAST_7_DAYS",
"lastBimonth": "LAST_BIMONTH",
"lastBiWeek": "LAST_BIWEEK",
"lastFinancialYear": "LAST_FINANCIAL_YEAR",
"lastMonth": "LAST_MONTH",
"lastQuarter": "LAST_QUARTER",
"lastSixMonth": "LAST_SIX_MONTH",
"lastWeek": "LAST_WEEK",
"lastYear": "LAST_YEAR",
"monthsThisYear": "MONTHS_THIS_YEAR",
"quartersThisYear": "QUARTERS_THIS_YEAR",
"thisBimonth": "THIS_BIMONTH",
"thisBiWeek": "THIS_BIWEEK",
"thisFinancialYear": "THIS_FINANCIAL_YEAR",
"thisMonth": "THIS_MONTH",
"thisQuarter": "THIS_QUARTER",
"thisSixMonth": "THIS_SIX_MONTH",
"thisWeek": "THIS_WEEK",
"thisYear": "THIS_YEAR",
"thisDay": "TODAY",
"weeksThisYear": "WEEKS_THIS_YEAR",
"yesterday": "YESTERDAY"
}